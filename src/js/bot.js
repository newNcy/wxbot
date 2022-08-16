
const net = require('net');
const {ethers, Provider, Wallet, BigNumber, utils, Contract, constants} = require("ethers");
const axios = require("axios");

/* 机器人 */
const url = 'https://rpc.flashbots.net/'
const provider = new ethers.providers.JsonRpcProvider(url)

class WxBot {
    constructor() {
        this.server = net.createServer(socket => {
            socket.on('data', async buffer => {
                let msg = buffer.toString()
                let obj = JSON.parse(msg)
                if (this.msg_callback) {
                    let reply = await this.msg_callback(obj)
                    if (reply != null) {
                        let robj = {
                            to : obj.source,
                            content : reply
                        }
                        socket.write(JSON.stringify(robj))
                    }
                }
            });
        })
    }
    on_msg(fn) {
        this.msg_callback = fn
    }
    async run() {
        this.server.listen(1224)
    }
}




async function collection_stats(slug) {
    let {data} = await axios.get(`https://api.opensea.io/api/v1/collection/${slug}/stats`, {
        headers: {
            'X-API-KEY': '2f6f419a083c46de9d83ce3dbe7db601'
        } 
    })
    return data
}


async function fetch_erc20(s, t) {
    let {data} = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${s}&tsyms=${t}`)
    let p = data[t.toUpperCase()]
    return p
}

async function fetch_erc20_list(ss, t) {
    let ps = new Array()
    for (var e of ss) {
        ps.push(fetch_erc20(e, t))
    }

    return await Promise.all(ps)
}




let bot = new WxBot()
bot.on_msg( async msg => {
    let text = msg.content
    if (text.startsWith('@chain-bot')) {
        return "嗯"
    }
    let is_cmd = text.startsWith('/')
    let cmd = text.substr(1).trim()
    console.log(is_cmd, cmd)
    if (is_cmd) {
        if (cmd == 'gas') {
            let gasPrice = await provider.getGasPrice()
            return Number(utils.formatUnits(gasPrice, "gwei")).toFixed(2) + ' gwei'
        } else if (cmd == 'menu') {
            return '/gas \\n/<token>'
        }else {
            let ts = cmd.split('-')
            let s = ts[0].split(':')
            let t = 'usd'
            if (ts.length > 1) {
                t = ts[1]
            }
            let ps = await fetch_erc20_list(s, t)
            let reply = ''
            for (var i in ps) {
                if (!ps[i]) continue;
                let p = ps[i]?ps[i].toString() : '----'
                reply += `${s[i]} ~ ${p} ${t}`
                if (i < ps.length -1) {
                    reply += '\\n'
                }
            }

            return reply
        }
    }
    //return msg.content
})
bot.run()
let a = {
    d : 'aaa\nbbb'
}

console.log(JSON.stringify(a))
