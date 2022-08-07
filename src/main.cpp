#include <iostream>
#include <Windows.h>
#include <TlHelp32.h>
#include <process.h>
#include <map>
#include <string>
#include <filesystem>


auto fetchProcessList()
{
    std::map<std::string, int> ret;
	auto snap = CreateToolhelp32Snapshot(TH32CS_SNAPALL, 0);
    PROCESSENTRY32 entry;
    entry.dwSize = sizeof(entry);
    bool res = Process32First(snap, &entry);
    while (res) {
        ret[entry.szExeFile] = entry.th32ProcessID;
        res = Process32Next(snap, &entry);
    }

    CloseHandle(snap);
    return ret;
}

inline void assertf(bool res, const char* f, ...)
{
    if (!res) {
        char buff[1024] = { 0 };
        va_list va;
        va_start(va, f);
        vsprintf(buff, f, va);
        va_end(va);
        throw std::runtime_error(buff);
    }
}


void loadDll(int pid, const std::string& path)
{
    auto process = OpenProcess(PROCESS_ALL_ACCESS, false, pid);
    if (!process) {
        printf("[%d]获取进程失败, 可能是权限不足\n", pid);
        return;
    }

    auto remotePath = VirtualAllocEx(process, nullptr, path.size(), MEM_COMMIT, PAGE_READWRITE);
    if (!remotePath) {
        printf("[%d]为进程开辟内存失败, 可能是权限不足\n", pid);
        return;
    }

    auto res = WriteProcessMemory(process, remotePath, path.data(), path.size(), nullptr);
    assertf(res, "写入内存失败");

    auto loadLibrary = GetProcAddress(GetModuleHandle("Kernel32.dll"), "LoadLibraryA");
    assertf(loadLibrary, "获取内存写入函数失败");

    auto t = CreateRemoteThreadEx(process, nullptr, 0, (LPTHREAD_START_ROUTINE)loadLibrary, remotePath, 0, nullptr, nullptr);
    WaitForSingleObject(t, 0xfffff);
    assertf(t, "创建远程线程失败");
    CloseHandle(t);
    CloseHandle(process);
}

void loadDll(const std::string& exe, const std::string& dll)
{
    auto plist = fetchProcessList();
    auto p = plist.find(exe);
    if (p != plist.end()) {
		std::cout << p->first<<"-"<<p->second << "-" <<dll<< std::endl;
        loadDll(p->second, dll);
    }
    else {
        printf("未找到%s进程\n", exe.c_str());
    }
}

void callRemote(const char* name)
{
	auto plist = fetchProcessList();
    auto p = plist.find("WeChat.exe");
    if (p != plist.end()) {
        auto pid = p->second;
		auto process = OpenProcess(PROCESS_ALL_ACCESS, false, pid);
		auto loadLibrary = GetProcAddress(GetModuleHandle("wxhook.dll"), "name");
		assertf(loadLibrary, "获取内存写入函数失败");

		auto t = CreateRemoteThreadEx(process, nullptr, 0, (LPTHREAD_START_ROUTINE)loadLibrary, 0, 0, nullptr, nullptr);
		WaitForSingleObject(t, 0xfffff);
        CloseHandle(process);
    }
}






int main(int argc, char * argv[])
{
    std::filesystem::path me(argv[0]);
    std::cout << argv[0] << std::endl;
    try {
        loadDll("WeChat.exe", (me.parent_path() / "wxhook.dll").string());
    }
    catch (std::runtime_error & e) {
        printf("error:%s\n", e.what());
    }
    return 0;
}
