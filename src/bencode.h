#pragma once
#include <string>
#include <map>
#include <vector>
#include <sstream>

namespace bencode
{
    typedef unsigned char byte_t;

    struct bvalue_t
    {
        byte_t type;
        bvalue_t(byte_t type):type(type){}
        bvalue_t(int i):type(0), i(i) {}
        bvalue_t(const std::string & str):type(1), s(str) {}
        ~bvalue_t() {}
        union
        {
            int i;
            std::string s;
            std::vector<bvalue_t*> l;
            std::map<std::string, bvalue_t*> d;
        };
        void encode(std::stringstream& ss)
        {
            if (type == 0)
            {
                ss << "i:" << i << 'e';
            }
            else if (type == 1)
            {
                ss << s.length() << ':' << s;
            }
            else if (type == 2) {
                ss << 'l';
                for (auto b : l) {
                    b->encode(ss);
                }
                ss << 'e';
            }
            else if (type == 3) {
                ss << 'd';
                for (auto& p : d) {
                    bvalue_t t(p.first);
                    t.encode(ss);
                    p.second->encode(ss);
                }
                ss << 'e';
            }
        }
    };


}
