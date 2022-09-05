
const net = require('net');
const {ethers, Provider, Wallet, BigNumber, utils, Contract, constants} = require("ethers");
const axios = require("axios");
const express = require('express');

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
            console.log(socket, 'connected')
            this.wx.add(socket)
        })
    }


    async on_packet(socket, msg) {
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
        }catch(e) {}
    }
    on_msg(fn) {
        this.msg_callback = fn
    }
    send(obj) {
        console.log('broadcast', obj)
        this.wx.forEach(e=> {
            console.log('send', obj, e)
            e.write(JSON.stringify(obj))
        })
    }
    async run() {
        this.server.listen(1224)
    }
}




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
    let text = msg.content
    if (text.startsWith('@chain-bot')) {
        return "嗯"
    }
    let is_cmd = text.startsWith('/')
    let full_cmd = text.substr(1).trim()
    let segs = full_cmd.split(' ')
    let cmd = segs[0]
    let args = segs.slice(1)
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
            return '/gas \\n/<token>'
        }else {
            let ts = full_cmd.split('>')
            let s = ts[0].split(':')
            let t = 'usd'
            if (ts.length > 1) {
                t = ts[1]
            }

            let reply = ''
            let needs = false
            let have_erc20 = false
            let have_erc721 = false
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
            }catch(e) {}
            try {
            let ns = await fetch_erc721_list(s, t)
                let f = true
                if (ns.length > 0) {
                    for (var i in ns) {
                        let n = ns[i]
                        if (!n || n.error) continue;
                        if (f && needs) {
                            reply += '\n------------------\n'
                            f = false
                        }
                        have_erc721 = true
                        reply += `${s[i]}\n-floor : Ξ${Number(n.floor_price).toFixed(4)}\n-holder : ${n.num_owners}\n-total : ${n.count}\n-24h sales : ${n.one_day_sales}`
                        if (i < ns.length -1) {
                            reply += '\n'
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
    }
    //return msg.content
})
bot.run()


var app = express()
app.use(express.json())

app.post('/', (req, res) => {
    let cmd = req.body
    if (cmd.to && (cmd.content|| cmd.image)) {
        bot.send(cmd)
    }
    console.log(req.body)
    res.json(req.body)
})

var server = app.listen(3000, () => {
    let host = server.address().address
    let port = server.address().port
    console.log('http://%s:%s', host, port)
})


