#include <Windows.h>
#include <string>
#include <sstream>
#include <iostream>
#include <thread>
#include <map>

using address_t = char *;

using Entry = void(*)();
using hook_fn_t = void(*)(int,int,int,int,int,int);
struct hook_info_t
{
	Entry origin;
	int origin_rel;
	hook_fn_t fn;
};

std::map<address_t, hook_info_t> hook_info;

void msg(const char* f, ...)
{
	char buf[1024] = { 0 };
	va_list arg;
	va_start(arg, f);
	vsprintf(buf, f, arg);
	va_end(arg);
	MessageBox(0, buf, "msg", 0);
}

address_t wxbase()
{
	return (address_t)GetModuleHandle("WeChatWin.dll");
}

auto abs2rel(void* func)
{
	return ((address_t)func - wxbase() - 0xc00);
}

auto rel2abs(int rel)
{
	return (wxbase() + (int)rel + 0xc00);
}

std::string wstring2string(const std::wstring & wstr)
{
	std::string result;
	int len = WideCharToMultiByte(CP_ACP, 0, wstr.c_str(), wstr.size(), NULL, 0, NULL, NULL);
	char* buffer = new char[len + 1];
	WideCharToMultiByte(CP_ACP, 0, wstr.c_str(), wstr.size(), buffer, len, NULL, NULL);
	buffer[len] = '\0';
	result.append(buffer);
	delete[] buffer;
	return result;
}

std::wstring string2wstring(const std::string& str)
{
	int len = MultiByteToWideChar(CP_ACP, 0, str.c_str(), str.size(), nullptr, 0);
	std::wstring result(len, 0);
	MultiByteToWideChar(CP_ACP, 0, str.c_str(), str.size(), result.data(), result.size());
	return result;
}

std::string read_utf8(char* msg)
{
	auto ptr = *(wchar_t**)msg;
	if (ptr) {
		return wstring2string(ptr);
	}

	return std::string();
}



Entry dispatch_for_ret(int ret, int eax, int ecx, int edx, int ebx, int esi, int edi)
{
	auto hook = hook_info[(address_t)ret];
	if (hook.fn) {
		hook.fn(eax, ecx, edx, ebx, esi, edi);
	}
	return hook.origin;
}

/*
 * 需要nake，因为在保存堆栈前需要插一个0到栈上，后面可以把原函数的绝对地址放到上面去，利用ret跳过去,可以不用污染任何寄存器
 */
void __declspec(naked) hook_dispatch()
{
	//保存现场
	__asm
	{
		push 0;
		push ebp;
		mov ebp, esp;
		pushad;
		pushfd;
	}
	// 调用hook函数, 把当前寄存器状态当成参数
	__asm 
	{
		push edi;
		push esi;
		push ebx;
		push edx;
		push ecx;
		push eax;
		mov eax, 8[ebp];
		push eax;
		call dispatch_for_ret;
		add esp,28;
		mov (4)[ebp], eax;
	}
	//恢复现场,并调用原函数 
	__asm
	{
		popfd;
		popad;
		pop ebp;
		ret;
	}
}

void install(int rel, void *func)
{
	address_t* operandptr = (address_t*)(rel2abs(rel) + 1);
	address_t ret_addr = (address_t)operandptr + 4;
	int newfunc = (address_t)hook_dispatch - ret_addr;
	int size = sizeof(newfunc);
	DWORD oldattr;
	VirtualProtectEx(GetCurrentProcess(), operandptr, sizeof(newfunc), PAGE_EXECUTE_READWRITE, &oldattr);
	int oldfunc;
	ReadProcessMemory(GetCurrentProcess(), operandptr, &oldfunc, sizeof(oldfunc), nullptr);
	hook_info[ret_addr] = {(Entry)(ret_addr + oldfunc),oldfunc, (hook_fn_t)func};
	WriteProcessMemory(GetCurrentProcess(), operandptr, &newfunc, sizeof(newfunc), nullptr);
	VirtualProtectEx(GetCurrentProcess(), operandptr, sizeof(newfunc), oldattr, &oldattr);
}

void uninstall(int rel)
{
	address_t* operandptr = (address_t*)(rel2abs(rel) + 1);
	address_t ret_addr = (address_t)operandptr + 4;
	auto& hook = hook_info[ret_addr];

	DWORD oldattr;
	VirtualProtectEx(GetCurrentProcess(), operandptr, sizeof(hook.origin_rel), PAGE_EXECUTE_READWRITE, &oldattr);
	WriteProcessMemory(GetCurrentProcess(), operandptr, &hook.origin_rel, sizeof(hook.origin_rel), nullptr);
	VirtualProtectEx(GetCurrentProcess(), operandptr, sizeof(hook.origin_rel), oldattr, &oldattr);
}


void __declspec(naked) call_abs()
{
	__asm 
	{
		ret;
	}
}

template <typename R, typename ... Args>
R call_remote(int rel, Args && ... args)
{
	address_t remote_fn = rel2abs(rel);
	call_abs(std::forward<Args>(args)..., remote_fn);
}

struct wstring
{
	wchar_t* data;
	int len;
	int cap;
	wstring(const std::wstring& w)
	{
		data = new wchar_t[w.length()]();
		memcpy(data, w.c_str(), w.size() * sizeof(wchar_t));
		len = w.length();
		cap = len;
	}
	wstring(int len)
	{
		data = new wchar_t[len]();
		this->len = len;
		cap = len;
	}
	~wstring()
	{
		if (data)
		{
			delete[] data;
		}
	}
};



void WINAPI sendText(const std::wstring &  wxid, const std::wstring & text)
{
	wstring id(wxid);
	wstring content(text);
	Entry remote_fn = (Entry)rel2abs(0x55C720);
	char* buf = new char[2048]();
	char* buf2 = new char[2048]();
	__asm {
		push 0;
		push 0;
		push 1;
		push buf;
		lea edi, content;
		push edi;	

		mov ecx, buf2;
		lea edx, id;
		call remote_fn;
		add esp, 20;
	}
	delete[] buf;
	delete[] buf2;
} 

void sendText(const std::string& wxid, const std::string& text)
{
	auto wid = string2wstring(wxid);
	auto wtext = string2wstring(text);
	sendText(wid, wtext);
}

void on_recv_msg(int eax, int ecx, int edx, int ebx, int esi, char* edi)
{
	auto source = read_utf8(edi + 0x48);
	auto content = read_utf8(edi + 0x70);
	auto member = read_utf8(edi + 0x174);

	printf("%s:%s:%s\n", source.c_str(),member.c_str(), content.c_str());
	sendText("filehelper", source + ":" + member +":" + content);
}

void openConsole()
{
	AllocConsole();
	freopen("CONOUT$", "w+t", stdout);
}

BOOL APIENTRY DllMain(HMODULE module, DWORD e, LPVOID reserve)
{
	std::map<int, void*> table = {
		{0x6EA632, on_recv_msg},
	};

	std::map<std::string, int> remote = {
		{"sendMsg", 0x55C720},
	};
	switch (e) {
		case DLL_THREAD_ATTACH: break;
		case DLL_THREAD_DETACH: break;
		case DLL_PROCESS_ATTACH:
			openConsole();
			for (auto& h : table) {
				install(h.first, h.second);
			}
			
			break;
		case DLL_PROCESS_DETACH: 
			for (auto& h : table) {
				uninstall(h.first);
			}
			break;
	}
	return true;
}