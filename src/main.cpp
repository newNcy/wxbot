#include <iostream>

#include <WinSock2.h>
#include <Windows.h>
#include <TlHelp32.h>
#include <process.h>
#include <map>
#include <string>
#include <filesystem>
#include "bencode.h"


#pragma comment(lib, "ws2_32.lib")

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
    assertf(process, "获取进程失败");

    auto remotePath = VirtualAllocEx(process, nullptr, path.size(), MEM_COMMIT, PAGE_READWRITE);
    assertf(remotePath, "开辟内存失败");

    auto res = WriteProcessMemory(process, remotePath, path.data(), path.size(), nullptr);
    assertf(res, "写入内存失败");

    //auto unload = GetProcAddress(GetModuleHandle("Kernel32.dll"), "FreeLibrary");

    auto loadLibrary = GetProcAddress(GetModuleHandle("Kernel32.dll"), "LoadLibraryA");
    assertf(loadLibrary, "获取内存写入函数失败");

    auto t = CreateRemoteThreadEx(process, nullptr, 0, (LPTHREAD_START_ROUTINE)loadLibrary, remotePath, 0, nullptr, nullptr);
    WaitForSingleObject(t, 2000);
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



class WxManager
{
    std::map<int, int, std::greater<int>> fds;
    int sock;
    fd_set fs;
public:
    void startTcpServer(uint16_t port)
    {
        WSADATA data;
        if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
            throw std::runtime_error("winsock init failed");
            return;
        }

        sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (socket < 0) {
            throw std::runtime_error("socket failed");
            return;
        }

        sockaddr_in peer;
        memset(&peer, 0, sizeof(peer));
        peer.sin_family = AF_INET;
        peer.sin_addr.S_un.S_addr = INADDR_ANY;
        peer.sin_port = htons(port);

        if (bind(sock, (sockaddr*)&peer, sizeof(peer)) == SOCKET_ERROR) {
            throw std::runtime_error("bind error");
            return;
        }

        if (listen(sock, 100) < 0)
        {
            throw std::runtime_error("listen error");
            return;
        }
        printf("listening on %d\n", htons(peer.sin_port));
        fds[sock] = sock;
        FD_ZERO(&fs);
        FD_SET(sock, &fs);

    }


    void run()
    {
        
        startTcpServer(1224);
        fd_set rs;
        while (true) {
            FD_ZERO(&rs);
            rs = fs;
            int max = fds.begin()->first + 1;
            int n = select(max, &rs, nullptr, nullptr, nullptr);
            for (auto & f : fds) {
                
                int fd = f.first;
                if (FD_ISSET(fd, &rs)) {
                    if (fd == sock) {
                        sockaddr_in peer;
                        memset(&peer, 0, sizeof(peer));
                        int len = sizeof(peer);
                        int cli = accept(sock, (sockaddr*)&peer, &len);
                        printf("attach to %d %s:%d\n", cli, inet_ntoa(peer.sin_addr), htons(peer.sin_port));
                        FD_SET(cli, &fs);
                        fds[cli] = cli;
                    }
                    else {
                        char buff[10240] = { 0 };
                        int rc = recv(fd, buff, 1024, 0);
                        if (rc > 0) {
                            printf("%s\n", buff);
                        }
                    }
                }
            }

        }
    }
};



int main(int argc, char* argv[])
{
    bencode::bvalue_t s("hello");
    bencode::bvalue_t i(124567);
    std::stringstream ss;
    s.encode(ss);
    i.encode(ss);
    std::cout << ss.str()<<std::endl;
    return 0;
    std::filesystem::path me(argv[0]);
    std::cout << argv[0] << std::endl;
    try {
        WxManager wxm;
        loadDll("WeChat.exe", (me.parent_path() / "wxhook.dll").string());
        wxm.run();
    }
    catch (std::runtime_error& e) {
        printf("error:%s\n", e.what());
    }
    return 0;
}
