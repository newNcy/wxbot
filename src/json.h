#pragma once
#include <string>
#include <map>
#include <vector>
#include <sstream>
#include <cassert>

namespace json
{
    typedef unsigned char byte_t;
    enum class tag_t { null, s, n, o, a, b};
    struct value_t
    {
        tag_t tag;
        union  
        {
            bool b;
            double n;
            std::string* s;
            std::vector<value_t> * a;
            std::map<std::string, value_t> *o;
        };
        value_t() :tag(tag_t::null),s(0),a(0),n(0) {}
        explicit value_t(bool b) { *this = b; }
        explicit value_t(const std::string& s) { *this = s; }
        explicit value_t(const char * s) { *this = s; }
        operator std::string& () { return *s; }
        value_t& operator = (bool b) { settag(tag_t::b); this ->b = b; return *this; }
        value_t& operator = (const char * str) { settag(tag_t::s); *s = str; return *this; }
        value_t& operator = (const std::string & str) { settag(tag_t::s); *s = str; return *this; }
        value_t& operator = (const value_t& v)
        {
            settag(v.tag);
            switch (tag)
            {
            case json::tag_t::s: *s = *v.s; break;
            case json::tag_t::n: n = v.n; break;
            case json::tag_t::o: *o = *v.o; break;
            case json::tag_t::a: *a = *v.a; break;
            case json::tag_t::b: b = v.b; break;
            default: break;
            }
            return *this;
        }
        value_t& operator[](const std::string& k) { settag(tag_t::o); return o->operator[](k); }
        bool has(const std::string& k) { if (tag == tag_t::o) { return o->find(k) != o->end(); } return false; }
        value_t& operator[](int k) { settag(tag_t::a); return a->operator[](k); }
        size_t size() const 
        {
            switch (tag)
            {
            case json::tag_t::o:
                return o->size();
                break;
            case json::tag_t::a:
                return a->size();
                break;
            default:
                break;
            }
            return 0;
        }
        void clear()
        {
            switch (tag)
            {
            case json::tag_t::s: delete s; break;
            case json::tag_t::o: delete o; break;
            case json::tag_t::a: delete a; break;
            default:
                break;
            }
        }

        void settag(tag_t t)
        {
            if (t == tag) return;
            clear();
            tag = t;
            switch (t)
            {
            case json::tag_t::s:
                s = new std::string;
                break;
            case json::tag_t::o:
                o = new std::map<std::string,value_t>;
                break;
            case json::tag_t::a:
                a = new std::vector<value_t>;
                break;
            default:
                break;
            }
        }

        void serialize(std::stringstream & ss)
        {
            if (tag == tag_t::s) {
                ss << '"';
                for (auto c : *s) {
                    if (c == '"') {
                        ss << '\\';
                    }
                    else if (c == '\n') {
                        ss<<'\\';
                        ss<<'n';
                        continue;
                    }
                    else if (c == '\r') {
                        ss << '\\';
                        ss << 'r';
                        continue;
                    } else if (c == '\t') {
                        ss << '\\';
                        ss << 't';
                        continue;
                    } 
                    ss << c;
                }
                ss << '"';
            }
            else if (tag == tag_t::n) ss << n;
            else if (tag == tag_t::null) ss << "null";
            else if (tag == tag_t::b) ss << b ? "true" : "false";
            else if (tag == tag_t::a) {
                ss << '[';
                int i = 0;
                int m = a->size();
                for (auto& v : *a) {
                    v.serialize(ss);
                    if (++ i < m) {
                        ss << ',';
                    }
                }
                ss << ']';
            }
            else if (tag == tag_t::o) {
                ss << '{';
                int i = 0;
                int m = o->size();
                for (auto& v : *o) {
                    value_t(v.first).serialize(ss);
                    ss << ':';
                    v.second.serialize(ss);
                    if (++ i < m) {
                        ss << ',';
                    }
                }
                ss << '}';
            }
        }

        char getc(const std::string& str, int & pos)
        {
            char c = 0;
            if (pos < str.length()) {
                c = str[pos++];
            }
            return c;
        }

        void whitespace(const std::string& str, int& start)
        {
            char c = 0;
            while (c = getc(str, start)) {
                if (c != ' ' && c != '\t' && c != '\n') {
                    start--;
                    break;
                }
            }
        }
        void fromstring(const std::string& str)
        {
            int start = 0;
            fromstring(str, start);
        }

        void fromstring(const std::string& str, int &start)
        {
            whitespace(str, start);
            char c = 0;
            if (c = getc(str, start)) {
                if (c == '"') {
                    std::stringstream ss;
                    bool turn = false;
                    while (c = getc(str, start)) {
                        if (c == '\\' && !turn) {
                            turn = true;
                            continue;
                        }else if (c == '"' && !turn) {
                            break;
                        }
                        if (turn)
                        {
                            if (c == 'n')
                            {
                                ss << '\n';
                            }
                            else if (c == '\\') {
                                ss << '\\';
                            }
                        }
                        else
                        {
                            ss << c;
                        }
                        turn = false;
                    }
                    *this = ss.str();
                }
                else if ('0' <= c && c <= '9' || c == '.') {
                    bool floating = c == '.';
                    std::stringstream ss;
                    while (c = getc(str, start) && ( '0' <= c && c<= '9' || c == '.' && !floating)) {
                        if (c == '.') {
                            floating = true;
                        }
                        ss << c;
                    }
                    settag(tag_t::n);
                    ss >> n;
                }
                else if (c == '{') {
                    settag(tag_t::o);
                    while (true) {
                        whitespace(str, start);
                        c = getc(str, start);
                        if (c == '}') break;
                        start--;
                        value_t k;
                        k.fromstring(str, start);
                        c = getc(str, start);
                        assert(c == ':');
                        value_t v;
                        v.fromstring(str, start);
                        o->operator[](*k.s) = v;
                        c = getc(str, start);
                        if (c != ',') {
                            assert(c == '}');
                            break;
                        }
                    }
                    whitespace(str, start);
                }
                else if (c == '[') {
                    settag(tag_t::a);
                    while (true) {
                        whitespace(str, start);
                        c = getc(str, start);
                        if (c == ']') break;
                        --start;
                        value_t v;
                        v.fromstring(str, start);
                        a->push_back(v);
                        c = getc(str, start);
                        if (c != ',') {
                            assert(c == ']');
                            break;
                        }
                    }
                }
            }
            whitespace(str, start);
        }

        std::string tostring()
        {
            std::stringstream ss;
            serialize(ss);
            return ss.str();
        }
    };
}
