#define NOMINMAX

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>

#include <chrono>
#include <iostream>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#if defined(__has_include)
#if __has_include(<filesystem>)
#include <filesystem>
namespace fs = std::filesystem;
#elif __has_include(<experimental/filesystem>)
#include <experimental/filesystem>
namespace fs = std::experimental::filesystem;
#else
#error "A C++17 filesystem implementation is required."
#endif
#else
#include <filesystem>
namespace fs = std::filesystem;
#endif

namespace {

constexpr int kStartupDelaySeconds = 3;
constexpr int kBackendPort = 3000;

std::wstring quote(const std::wstring& value) {
  std::wstring result = L"\"";
  for (wchar_t ch : value) {
    if (ch == L'"') {
      result += L"\\\"";
    } else {
      result += ch;
    }
  }
  result += L"\"";
  return result;
}

std::wstring readEnv(const wchar_t* name) {
  const DWORD length = GetEnvironmentVariableW(name, nullptr, 0);
  if (length == 0) {
    return L"";
  }

  std::wstring value(length, L'\0');
  const DWORD copied = GetEnvironmentVariableW(name, value.data(), length);
  value.resize(copied);
  return value;
}

bool fileExists(const fs::path& path) {
  std::error_code error;
  return fs::is_regular_file(path, error);
}

bool directoryExists(const fs::path& path) {
  std::error_code error;
  return fs::is_directory(path, error);
}

bool isLocalPortOpen(int port) {
  WSADATA wsaData{};
  if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
    return false;
  }

  SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (sock == INVALID_SOCKET) {
    WSACleanup();
    return false;
  }

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(static_cast<u_short>(port));
  address.sin_addr.s_addr = inet_addr("127.0.0.1");

  const bool connected =
      connect(sock, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0;
  closesocket(sock);
  WSACleanup();
  return connected;
}

fs::path executableDirectory() {
  std::wstring buffer(MAX_PATH, L'\0');
  DWORD size = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));

  while (size == buffer.size() && GetLastError() == ERROR_INSUFFICIENT_BUFFER) {
    buffer.resize(buffer.size() * 2);
    size = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  }

  buffer.resize(size);
  return fs::path(buffer).parent_path();
}

std::optional<fs::path> findProjectRoot(const fs::path& start) {
  fs::path current = fs::absolute(start);

  for (int depth = 0; depth < 8; ++depth) {
    if ((fileExists(current / L"backend" / L"dist-exe" / L"server.cjs") &&
         directoryExists(current / L"backend" / L"dist-exe" / L"frontend-dist")) ||
        (fileExists(current / L"backend" / L"server.js") &&
         directoryExists(current / L"frontend"))) {
      return current;
    }

    const fs::path parent = current.parent_path();
    if (parent.empty() || parent == current) {
      break;
    }
    current = parent;
  }

  return std::nullopt;
}

std::optional<fs::path> findNodeExe() {
  const std::wstring configured = readEnv(L"NODE_EXE");
  if (!configured.empty() && fileExists(configured)) {
    return fs::path(configured);
  }

  std::vector<fs::path> candidates;
  const std::wstring programFiles = readEnv(L"ProgramFiles");
  const std::wstring programFilesX86 = readEnv(L"ProgramFiles(x86)");

  if (!programFiles.empty()) {
    candidates.emplace_back(fs::path(programFiles) / L"nodejs" / L"node.exe");
  }
  if (!programFilesX86.empty()) {
    candidates.emplace_back(fs::path(programFilesX86) / L"nodejs" / L"node.exe");
  }

  for (const fs::path& candidate : candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  DWORD length = SearchPathW(nullptr, L"node.exe", nullptr, 0, nullptr, nullptr);
  if (length > 0) {
    std::wstring resolved(length, L'\0');
    SearchPathW(nullptr, L"node.exe", nullptr, length, resolved.data(), nullptr);
    resolved.resize(length - 1);
    if (fileExists(resolved)) {
      return fs::path(resolved);
    }
  }

  return std::nullopt;
}

void showError(const std::wstring& message) {
  std::wcerr << message << std::endl;
  MessageBoxW(nullptr, message.c_str(), L"Music Player", MB_ICONERROR | MB_OK);
}

std::wstring buildCommandLine(const fs::path& executable,
                              const std::vector<std::wstring>& args) {
  std::wstring command = quote(executable.wstring());
  for (const std::wstring& arg : args) {
    command += L" ";
    command += quote(arg);
  }
  return command;
}

std::optional<PROCESS_INFORMATION> spawnProcess(
    const std::wstring& label,
    const fs::path& executable,
    const std::vector<std::wstring>& args,
    const fs::path& workingDirectory,
    HANDLE cleanupJob,
    DWORD creationFlags) {
  if (!fileExists(executable)) {
    showError(label + L" executable was not found:\n" + executable.wstring());
    return std::nullopt;
  }

  std::wstring commandLine = buildCommandLine(executable, args);
  std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
  mutableCommand.push_back(L'\0');

  STARTUPINFOW startupInfo{};
  startupInfo.cb = sizeof(startupInfo);

  PROCESS_INFORMATION processInfo{};
  const std::wstring cwd = workingDirectory.wstring();
  const BOOL started = CreateProcessW(
      executable.c_str(),
      mutableCommand.data(),
      nullptr,
      nullptr,
      FALSE,
      creationFlags | CREATE_UNICODE_ENVIRONMENT,
      nullptr,
      cwd.empty() ? nullptr : cwd.c_str(),
      &startupInfo,
      &processInfo);

  if (!started) {
    const DWORD error = GetLastError();
    showError(L"Failed to start " + label + L". Win32 error: " +
              std::to_wstring(error));
    return std::nullopt;
  }

  if (cleanupJob && !AssignProcessToJobObject(cleanupJob, processInfo.hProcess)) {
    std::wcerr << L"[Warn] Could not attach " << label
               << L" to cleanup job. Win32 error: " << GetLastError()
               << std::endl;
  }

  CloseHandle(processInfo.hThread);
  std::wcout << L"[OK] Started " << label << std::endl;
  return processInfo;
}

int runLauncher(int argc, wchar_t* argv[]) {
  bool checkOnly = false;
  bool smokeOnly = false;
  for (int i = 1; i < argc; ++i) {
    if (std::wstring(argv[i]) == L"--check") {
      checkOnly = true;
    } else if (std::wstring(argv[i]) == L"--smoke") {
      smokeOnly = true;
    }
  }

  std::wcout << L"=== Music Player C++ Launcher ===" << std::endl;

  const auto projectRoot = findProjectRoot(executableDirectory());
  if (!projectRoot) {
    showError(L"Could not find project root. Expected backend/server.js and "
              L"frontend next to this launcher or in a parent directory.");
    return 1;
  }

  const auto nodeExe = findNodeExe();
  if (!nodeExe) {
    showError(L"Node.js was not found. Install Node.js or set NODE_EXE to "
              L"the full path of node.exe.");
    return 1;
  }

  const fs::path backendDir = *projectRoot / L"backend";
  const fs::path frontendDir = *projectRoot / L"frontend";
  const fs::path packagedBackendDir = backendDir / L"dist-exe";
  const fs::path packagedBackendScript = packagedBackendDir / L"server.cjs";
  const bool usePackagedBackend = fileExists(packagedBackendScript);
  const fs::path backendScript =
      usePackagedBackend ? packagedBackendScript : backendDir / L"server.js";
  const fs::path backendWorkingDir =
      usePackagedBackend ? packagedBackendDir : backendDir;
  const fs::path electronExe =
      frontendDir / L"node_modules" / L"electron" / L"dist" / L"electron.exe";
  const fs::path electronMain = frontendDir / L"electron" / L"main.cjs";

  if (!fileExists(backendScript)) {
    showError(L"Backend entry was not found:\n" + backendScript.wstring());
    return 1;
  }
  if (!fileExists(electronExe)) {
    showError(L"Electron executable was not found:\n" + electronExe.wstring() +
              L"\nRun npm install inside frontend first.");
    return 1;
  }
  if (!fileExists(electronMain)) {
    showError(L"Electron main file was not found:\n" + electronMain.wstring());
    return 1;
  }

  if (checkOnly) {
    std::wcout << L"[OK] Project root: " << projectRoot->wstring() << std::endl;
    std::wcout << L"[OK] Node.js: " << nodeExe->wstring() << std::endl;
    std::wcout << L"[OK] Backend entry: " << backendScript.wstring()
               << std::endl;
    std::wcout << L"[OK] Electron: " << electronExe.wstring() << std::endl;
    std::wcout << L"[OK] Native launcher configuration is valid." << std::endl;
    return 0;
  }

  std::optional<PROCESS_INFORMATION> backend;
  if (isLocalPortOpen(kBackendPort)) {
    std::wcout << L"[1/2] Backend is already running on port " << kBackendPort
               << std::endl;
  } else {
    std::wcout << L"[1/2] Starting backend..." << std::endl;
    backend = spawnProcess(L"backend", *nodeExe, {backendScript.wstring()},
                           backendWorkingDir, nullptr, CREATE_NO_WINDOW);
    if (!backend) {
      return 1;
    }

    bool ready = false;
    DWORD backendExitCode = STILL_ACTIVE;
    for (int attempt = 0; attempt < kStartupDelaySeconds * 2; ++attempt) {
      std::this_thread::sleep_for(std::chrono::milliseconds(500));
      if (isLocalPortOpen(kBackendPort)) {
        ready = true;
        break;
      }
      if (GetExitCodeProcess(backend->hProcess, &backendExitCode) &&
          backendExitCode != STILL_ACTIVE) {
        break;
      }
    }

    if (!ready) {
      if (backend) {
        CloseHandle(backend->hProcess);
      }
      showError(L"Backend did not become ready on port " +
                std::to_wstring(kBackendPort) + L". Exit code: " +
                std::to_wstring(backendExitCode));
      return 1;
    }
  }

  if (smokeOnly) {
    if (backend) {
      TerminateProcess(backend->hProcess, 0);
      CloseHandle(backend->hProcess);
    }
    std::wcout << L"[OK] Smoke test backend started successfully." << std::endl;
    return 0;
  }

  std::wcout << L"[2/2] Starting desktop window..." << std::endl;
  auto desktop = spawnProcess(L"desktop window", electronExe,
                              {frontendDir.wstring()}, frontendDir, nullptr, 0);
  if (!desktop) {
    if (backend) {
      CloseHandle(backend->hProcess);
    }
    return 1;
  }

  std::wcout << L"[OK] Desktop window started. Web is also available at http://localhost:"
             << kBackendPort << std::endl;
  CloseHandle(desktop->hProcess);
  if (backend) {
    CloseHandle(backend->hProcess);
  }
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  return runLauncher(argc, argv);
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  int argc = 0;
  wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  const int exitCode = runLauncher(argc, argv);
  if (argv) {
    LocalFree(argv);
  }
  return exitCode;
}
