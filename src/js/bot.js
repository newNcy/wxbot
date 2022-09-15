
const net = require('net');
const {ethers, Provider, Wallet, BigNumber, utils, Contract, constants} = require("ethers");
const axios = require("axios");
const express = require('express');
const sqlite = require('./data.js')
const mt = require('moment-timezone')

/* 机器人 */
const url = 'https://rpc.flashbots.net/'
const provider = new ethers.providers.JsonRpcProvider(url)


class WxBot {

    constructor() {
        this.wx = new Set()
        this.server = net.createServer(socket => {
            
            socket.on('data', async buffer => {
                console.log('new', buffer.length)
                if (this.cache) {
                    this.cache = Buffer.concat([this.cache, buffer])
                }else {
                    this.cache = buffer
                }

                let buf = this.cache
                console.log('old', buf.length)

                while (buf.length > 2) {
                    let len = buf.readUint16BE()
                    console.log('expect', len)
                    if (buf.length - 2 >= len) {
                        let body = buf.slice(2, 2 + len)
                        this.on_packet(socket, body.toString())
                        buf = buf.slice(2+len)
                    } else {
                        break
                    }
                }

                this.cache = buf
                
            });
            socket.on('error', () => {
                console.log('与微信连接发生错误')
            });
        })
        this.server.on('connection', socket => {
            console.log('connected')
            this.wx.add(socket)
        })
    }


    async on_packet(socket, msg) {
        msg = msg.split('\\n').join('')
        try {
            let obj = JSON.parse(msg)
            if (this.msg_callback) {
            let reply = await this.msg_callback(obj)
            if (reply != null) {
                let robj = {
                    to : obj.source,
                    content : reply,
                    notify : obj.member != '' ? [obj.member] : null,
                }
                socket.write(JSON.stringify(robj))
            }
        }
        }catch(e) {
            console.log(e, msg)
        }
    }
    on_msg(fn) {
        this.msg_callback = fn
    }
    send(obj) {
        console.log('broadcast', obj)
        this.wx.forEach(e=> {
            e.write(JSON.stringify(obj))
        })
    }
    async run() {
        this.server.listen(1224)
    }
}



let data = {}

async function collection_stats(slug) {
    try {
        let {data:stats} = await axios.get(`https://api.opensea.io/api/v1/collection/${slug}/stats`, {
            headers: {
                'X-API-KEY': '2f6f419a083c46de9d83ce3dbe7db601'
            } 
        })
        return stats.stats
    }catch(e) {
        console.log(e)
    }
}

async function gem_collections(slug) {
    let {data:data} = await axios.post(`https://api-5.gemlabs.xyz/collections`, {
        fields : {slug:1, name:1, stats:{floor_price:1, }},
            filters : { slug: slug.toLowerCase()}
        }, {
        headers : {
            'x-api-key': 'iMHRYlpIXs3zfcBY1r3iKLdqS2YUuOUs',
            'Content-type': 'application/json',
            'referer':'https://www.gem.xyz/',
            'origin':'https://www.gem.xyz'
        },
    })
    try {
        if (data.error) {
            return data
        }
        console.log(data)
    let list = data.data
    let ls = slug.toLowerCase()
    for (var d of list) {
        let ss = d.slug.toLowerCase()
        console.log(d, ss, ls)
        if (ss == ls) {
            return d.stats
        }
    }
    }catch(e) {
        console.log(e)
    }
}

function getFullNum(num){
    //处理非数字
    if(isNaN(num)){return num};
    //处理不需要转换的数字
    var str = ''+num;
    if(!/e/i.test(str)){return num;};
    return (num).toFixed(18).replace(/\.?0+$/, "");
}

async function fetch_erc20(s, t) {
    let {data} = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${s}&tsyms=${t}`)
    let p = data[t.toUpperCase()]
    console.log(s, p)
    return getFullNum(p)
}

async function fetch_erc20_list(ss, t) {
    let ps = new Array()
    for (var e of ss) {
        ps.push(fetch_erc20(e, t))
    }

    return await Promise.all(ps)
}


async function fetch_erc721(n) {
    return gem_collections(n)
    //return collection_stats(n)
}

async function fetch_erc721_list(ss, t) {
    let ps = new Array()
    for (var s of ss) {
        ps.push(fetch_erc721(s))
    }
    return await Promise.all(ps)
}


async function do_alias(sender, s) {
    let res = []
    if (data.alias) {
        for (var i in s) {
            let v = s[i]
            let e = data.alias.find(e => e.user == sender && e.name == v && e.value.length > 0)
            if (e) {
                console.log(v, '->', e.value)
               res.push(e.value)
            } else {
                console.log(v, '->', v)
                res.push(v)
            }
        }
    } else {
        return s
    }
    return res
}

async function handle_query(sender, s, t, full_cmd) {
    let reply = ''
    let needs = false
    let have_erc20 = false
    let have_erc721 = false
    s = await do_alias(sender, s)
    console.log(s)
    let sp = '\n------------------\n'
    try {
        let ps = await fetch_erc20_list(s, t)
        for (var i in ps) {
            if (!ps[i]) continue;
            needs = true
            have_erc20 = true
            reply += `${s[i]} - ${ps[i]} ${t}`
            if (i < ps.length -1) {
                reply += '\n'
            }
        }
    }catch(e) {
        console.log(e)
    }
    try {
        let ns = await fetch_erc721_list(s, t)
        let f = true
        if (ns.length > 0) {
            for (var i in ns) {
                let n = ns[i]
                if (!n || n.error) continue;
                if (f && needs) {
                    reply += sp
                    f = false
                }
                have_erc721 = true
                reply += `${s[i]}\n地板：${Number(n.floor_price).toFixed(4)}Ξ\n总数：${n.count}\n持有人数：${n.num_owners}\n日成交量：${n.one_day_sales}`
                if (i < ns.length -1) {
                    reply += sp
                }

            }
        }
    }catch(e) {
        console.log(e)
    }

    if (!have_erc20 && !have_erc721) {
        return `没找到任何跟 ${full_cmd} 有关的信息`
    }
    return reply
}

async function handle_alias(sender, args) {
    if (args.length == 0) {
        alias.map(e => {
            if (e.user == sender) {
                sender_alias.push(e)
            }
        })
    } else if (args.length == 2) {
        let o = {user : sender, name : args[0], value:args[1]}
        if (!data.alias) {
            data.alias = [o]
        } else {
            let idx = data.alias.findIndex(e=> e.user == sender && e.name == args[0])
            if (idx >= 0) {
                data.alias[idx].value = args[1]
            } else {
                data.alias.push(o)
            }
        }
        return `已将 ${args[0]} 映射为 ${args[1]}`
    }

    return ''
}

function is_tz(tz) {
    return mt().tz(tz).utcOffset() != mt().utcOffset()
}

let bot = new WxBot()
bot.on_msg( async msg => {
    console.log(msg)
    if (msg.source == '23091413147@chatroom' || msg.source == '4610303176@chatroom') {
        let c26 = 'https://bot.https.sh/callback'
        try {
            let {data} = await axios.post(c26, {data : msg})
            console.log(data)
            if (data) {
                return JSON.stringify(data)
            }
        }catch (e) {
            console.log(e)
        }
    }
    if (msg.source.endsWith('@chatroom')) {
        let row = { wxid : msg.source }
        if (!data.chatrooms) {
            data.chatrooms = [row]
        } else {
            if (data.chatrooms.findIndex( e=> e.wxid == msg.source) < 0) {
                data.chatrooms.push(row)
            }
        }
    }

    let text = msg.content
    if (text.startsWith('@chain-bot')) {
        return "嗯"
    }
    let is_cmd = text.startsWith('/')
    let full_cmd = text.substr(1).trim()
    let segs = full_cmd.split(' ')
    let cmd = segs[0]
    let args = segs.slice(1)
    let sender = msg.member ? msg.member : msg.source
    if (is_cmd) {
        if (cmd == 'gas') {
            let gasPrice = await provider.getGasPrice()
            return Number(utils.formatUnits(gasPrice, "gwei")).toFixed(2) + ' gwei'
        } else if (cmd == 'remind') {
            if (args.length !=2) {
                return '/remind 时间 备忘'
            }
            return `${args[0]} 时提醒你-${args[1]}`
        }else if (cmd == 'menu') {
            return '/gas \n/<token>'
        }else if (cmd == 'alias') {
            return handle_alias(sender, args)
        }else {
            let ts = full_cmd.split('>')
            let s = ts[0].split(':')
            let t = 'usd'
            if (ts.length > 1) {
                t = ts[1]
            }

            let reply = await handle_query(sender, s, t, full_cmd)

            return reply
        }
    }
    //return msg.content
})



var app = express()
app.use(express.json())

app.post('/send', (req, res) => {
    let cmd = req.body
    if (cmd.to && (cmd.content|| cmd.image)) {
        bot.send(cmd)
    }
    console.log(req.body)
    res.json(req.body)
})

async function sleep(ms) {
    return new Promise(r=>{ setInterval(r, ms)})
}

app.post('/broadcast', async (req, res) => {
    let msg = req.body
    if (data.chatrooms && (msg.content || msg.image)) {
        for (var room of data.chatrooms) {
            console.log('broadcast to', room)
            msg.to = room.wxid
            bot.send(msg)
            await sleep(5*1000)
        }
        res.send('ok')
    }
    res.send('failed')
})

app.get('/chatrooms', async (req, res) => {
    res.json(data.chatrooms)
})


async function main () {
    data = await sqlite.load('bot.db')
    console.log('load data ...', data)
    bot.run()
    var server = app.listen(3000, () => {
        let host = server.address().address
        let port = server.address().port
        console.log('http://%s:%s', host, port)
    })

    process.on('SIGINT', async () => {
        console.log('save data...', data)
        await sqlite.save(data, 'bot.db')
        process.exit()
    })
}
main()

