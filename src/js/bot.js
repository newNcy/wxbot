
const net = require('net');
const {ethers, Provider, Wallet, BigNumber, utils, Contract, constants} = require("ethers");
const axios = require("axios");
const fs = require("fs");
const express = require('express');
const data_path = './data/'
const sqlite = require(data_path+'data.js')
const tw = require(data_path +'tw.js')
const Path = require('path') 
const mt = require('moment-timezone') 

const admin = 'wxid_qamenm9apak622'


/* 机器人 */
const url = 'https://rpc.flashbots.net/'
const provider = new ethers.providers.JsonRpcProvider(url)


class WxBot {

    constructor() {
        this.wx = new Set()
        this.server = net.createServer(socket => {
            
            socket.on('data', async buffer => {
                if (this.cache) {
                    this.cache = Buffer.concat([this.cache, buffer])
                }else {
                    this.cache = buffer
                }

                let buf = this.cache

                while (buf.length > 2) {
                    let len = buf.readUint16BE()
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
            },
            proxy : {
                host : '127.0.0.1',
                port : 7890
            }
        })
        return stats.stats
    }catch(e) {
        console.log(e)
    }
}

let gem_cache = {}

function get_sec() {
    return Math.floor(new Date() / 1000)
}

async function gem_collections(slug) {
    slug = slug.toLowerCase()
    if (gem_cache[slug]) {
        let c = gem_cache[slug]
        let now = get_sec()
        if (now - c.time < 20) {
            return c
        }
    }
    let url = 'https://api-v2-4.gemlabs.xyz/collections'
    let key = 'rLnNH1tdrT09EQjGsjrSS7V3uGonfZLW'
    let url2 = `https://api-v2-4.gemlabs.xyz/collections`
    let key2 = 'iMHRYlpIXs3zfcBY1r3iKLdqS2YUuOUs'

    for (var v = 4; v < 7; ++ v) {
        let {data:data} = await axios.post( `https://api-v2-${v}.gemlabs.xyz/collections`, {
                fields : {slug:1, name:1, stats:{floor_price:1, }},
            filters : { slug: slug.toLowerCase()}
        }, {
            headers : {
                'x-api-key': key,
                'Content-type': 'application/json',
                'referer':'https://www.gem.xyz/',
                'origin':'https://www.gem.xyz'
            },
            proxy : { host : '127.0.0.1', port : 7890 }
        })
        try {
            console.log(data)
            let list = data.data
            let ls = slug.toLowerCase()
            for (var d of list) {
                let ss = d.slug.toLowerCase()
                if (ss == ls) {
                    let r = d.stats
                    r.time = get_sec()
                    gem_cache[slug] = r
                    return r
                }
            }
        }catch(e) {
            console.log(e)
        }
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

async function fetch_erc20_coinmarketcap(s, t) {
    try {
    let {data:{data}} = await axios.get(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${s}&convert=${t}`, {
        headers: {
            'X-CMC_PRO_API_KEY': '7d08a0f8-00ba-4f6e-83ed-8f67a9df2105',
            'Accept': 'application/json',
      },
    })
    console.log(data)
    }catch(e) {
    console.log(e)
    }
}

async function fetch_erc20_list(ss, t) {
    let ps = new Array()
    for (var e of ss) {
        //fetch_erc20_coinmarketcap(e, t)
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
            if (!e) {
                e = data.alias.find(e => e.user == admin && e.name == v && e.value.length > 0)
            }

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

function emit_query_event(name)
{
    if (!data.query_log) {
        data.query_log = []
    }
    let item = data.query_log.find(e => e.name == name)
    if (!item) {
        item = {name : name, count : 0}
        data.query_log.push(item)
    }

    item.count ++;
    console.log(item)
}

async function handle_query(sender, s, t, full_cmd) {
    let reply = ''
    let needs = false
    let have_erc20 = false
    let have_erc721 = false
    let rs = await do_alias(sender, s)

    let alias_hint = false
    let alias_ex = ''
    for (let i in rs) {
        let t = rs[i]
        emit_query_event(t)
        if (t.length > 10 && t == s[i]) {
            alias_hint = true
            alias_ex = t
        }
    }

    s = rs
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
                if (n.seven_day_sales ==0) continue;
                if (f && needs) {
                    reply += sp
                    f = false
                }
                have_erc721 = true
                reply += `${s[i]}\n地板：${Number(n.floor_price).toFixed(4)}Ξ\n挂单：${n.items_listed}\n日成交额：${Number(n.one_day_volume).toFixed(3)}Ξ\n持有/总数：${n.num_owners}/${n.count}`
                if (i < ns.length -1) {
                    reply += sp
                }

            }
        }
    }catch (e) {
        console.log(e)
    }

    if (alias_hint && reply && reply.length > 0) {
        reply += `${sp}ps:可以使用 /alias 缩写 全称\n即可用 /缩写 查询`
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
        return `已将 ${args[0]} 关联到 ${args[1]}`
    }

    return ''
}


function t(m) {
    return m.format('YYYY-MM-DD HH:mm:ss')
}

var menu = 
`1. 查询当前gas price  /gas
2. 查询erc20/erc721    /gem上的名字(slug) 
  2.1 同时查多个用:分隔 例如 /azuki:eth
  2.2 token价格默认用usd显示，如果需要换一种价格币，可以用 >名称 指定， 例如 /eth>btc 返回eth的btc价格 也就是eth/btc交易对价格
3. 当token名字不便于输入时，使用 /alias 缩写 原名称， 下次查询使用 /缩写 将替换成 /原名称`

let bot = new WxBot()
bot.on_msg( async msg => {
    if (msg.source == '20822945064@chatroom')
        return
    if (msg.source == '23091413147@chatroom' || msg.source == '4610303176@chatroom') {
        let c26 = 'https://bot.https.sh/callback'
        try {
            let {data} = await axios.post(c26, {data : msg})
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
    let is_cmd = text.startsWith('/')
    let full_cmd = text.substr(1).trim().toLowerCase()
    let segs = full_cmd.split(' ')
    let cmd = segs[0]
    let args = segs.slice(1)
    let sender = msg.member ? msg.member : msg.source
    let reply = ''
    let formats = [
        'HH:mm',
        'HH:mm:ss',
        'YYYY-MM-DD',
        'YYYY-MM-DD HH:mm',
        'YYYY-MM-DD HH:mm:ss',
    ]
    if (is_cmd) {
        if (msg.source == '21345624925@chatroom') {
            let dandao = 'http://175.27.128.209:8088/partner/nft/receiveCmd'
            msg.cmd = cmd
            msg.is_cmd = is_cmd
            msg.args = args
            console.log(msg)
            try {
                let {data}= await axios({
                    url:dandao,
                    method:"post",
                    headers:{
                        "Content-Type":"application/json"
                    },
                    data:msg
                })
                console.log('dandao', data)
                if (data) {
                    return JSON.stringify(data)
                }
            }catch (e) {
                console.log(e)
            }
        }

        console.log('exec', cmd)
        if (cmd == 'gas') {
            let gasPrice = await provider.getGasPrice()
            reply = Number(utils.formatUnits(gasPrice, "gwei")).toFixed(2) + ' gwei'
        } else if (mt.tz.zone(cmd)) {
            if (args.length == 0) {
                return `${cmd}时间 \n${mt().tz(cmd).format('YYYY-MM-DD HH:mm:ss')}`
            }else {
                let z = mt.tz.zone(cmd)
                let m = args.join(' ')
                let om = mt(m,formats)
                let lm = mt.unix(om.tz(cmd, true).unix())

                return `${cmd}时间\n${t(om)}\n北京时间\n${t(lm)}`
            }
        } else if (cmd == 'remind') {
            if (args.length !=2) {
                return '/remind 时间 备忘'
            }
            return `${args[0]} 时提醒你-${args[1]}`
        }else if (cmd == 'reg') {
            if (args.length == 1 && sender == 'wxid_qamenm9apak622' && sender != msg.source) {
                data.proxy = data.proxy ? data.proxy : []
                let rec = data.proxy.findIndex(e=> e.from == args[0]  && e.to == msg.source)
                if (rec < 0) {
                    data.proxy.push({from : args[0], to : msg.source})
                    return `已为此群订阅来自 ${args[0]} 的推送`
                } else {
                    return '记录已存在'
                }
            }
        }else if (cmd == 'help') {
            reply = menu
        }else if (cmd == 'alias') {
            return handle_alias(sender, args)
        }else {
            let ts = full_cmd.split('>')
            let s = ts[0].split(':')
            let t = 'usd'
            if (ts.length > 1) {
                t = ts[1]
            }

            reply = await handle_query(sender, s, t, full_cmd)

        }
        if (!reply || reply.length == 0) {
            reply = `未找到任何 ${full_cmd} 相关信息, /help 获取帮助信息`
        }

        return reply
    }
    //return msg.content
})



/* 网页控制 */
var app = express()
app.use(express.json())

app.post('/send', (req, res) => {
    let cmd = req.body

    if (cmd.from == 'dandao') {
        cmd.to = '21345624925@chatroom'
    } else {
        if (data.proxy) {
            let to = data.proxy.findIndex(e => e.from == cmd.from)
            if (to >= 0) {
                cmd.to = data.proxy[to].to
            }
        } else {
            console.log('no proxy data')
        }
    }
    if (!cmd.to) {
        res.json({error:'unknown from'})
        return
    }

    if (cmd.to && (cmd.content|| cmd.image)) {
        bot.send(cmd)
    }
    console.log(req.body)
    res.json(req.body)
})

async function sleep(ms) {
    return new Promise(r=>{ setInterval(r, ms)})
}

async function broadcast(msg)
{
    for (var room of data.chatrooms) {
        console.log('broadcast to', room)
        msg.to = room.wxid
        bot.send(msg)
        await sleep(10*1000)
    }
}

app.post('/broadcast', async (req, res) => {
    let msg = req.body
    try {
        if (data.chatrooms && (msg.content || msg.image)) {
            broadcast(msg)
            res.send('ok')
        }
        res.send('failed')
    }catch(e) {}
})

app.get('/chatrooms', async (req, res) => {
    res.json(data.chatrooms)
})


/* twitter 同步 */
async function download_image(url, name) {
  const path = Path.resolve(__dirname, name)
  const writer = fs.createWriteStream(path)

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  })

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}


async function on_utopia_tweet(e) {
    let to = '21161026002@chatroom'

    let text = e.data.text
    let start = text.indexOf('@utopia_giveaway')
    text = text.substr(0, start)

    let idx = 0;
    let msg = { content : text }
    for (var m of e.includes.media) {
        if (m.type == 'photo') {
            let img = `${idx++}.jpg`
            let image = process.cwd() + '\\' + img
            await download_image(m.url, img)
            msg.image = image
        }
    }

    broadcast(msg)
}


async function main () {
    let rules = [
        {
            value : '-is:retweet from:UtopiaClub3 has:mentions UTPCryptoGirl'
        }
    ]

    tw.feed_tweets(rules, on_utopia_tweet)

    data = await sqlite.load(data_path +'bot.db')
    console.log('load data ...', data)
    data.chatrooms = Array.from(
        new Set( 
            data.chatrooms.map(e=>JSON.stringify(e))
        )
    ).map(e=>JSON.parse(e))
    console.log(data.chatrooms.length, 'chatrooms')
    bot.run()
    var server = app.listen(3000, () => {
        let host = server.address().address
        let port = server.address().port
        console.log('http://%s:%s', host, port)
    })

    process.on('SIGINT', async () => {
        data.abbr2offset = null
        console.log('save data...', data)
        await sqlite.save(data, data_path +'bot.db')
        process.exit()
    })
}
main()





