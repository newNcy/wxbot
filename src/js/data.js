

var sqlite3 = require('sqlite3');



async function all(db, sql) {
    //console.log(sql)
    return new Promise(res => {
        db.all(sql, (_, r) => { if (_) console.log(_);res(r)})
    })
}

async function run(db, sql) {
    //console.log(sql)
    return new  Promise(res => {
        db.run(sql, (_, r) => { if (_) console.log(_);res(r)})
    })
}

async function connect(path) {
    return new Promise(res => {
        let db = new sqlite3.Database(path, async function() {
            res(db)
        })
    })
}

async function get_tables(db) {
    return await all(db, `select name from sqlite_master where type = 'table'`)
}

async function drop_tables(db) {
    let tables = await get_tables(db)
    for (var d of tables) {
        await run(db, `drop table ${d.name}`)
    }
}


async function load_table(db, name) {
    let data = await all(db, `select * from ${name}`)
    return data
}


async function load(path) {
    let db = await connect(path)
    let tables = await get_tables(db)
    let data = {}
    for (var d of tables) {
        data[d.name] = await load_table(db, d.name)
    }

    return data
}


function gen_field_meta(k, v, withtype) {
    return `${k}${withtype ? typeof(v) == 'string'? ' text':' real' : ''}`
}

function gen_meta(obj, withtype) {
    let meta = '('
    let first = true
    for (var k in obj) {
        let v = obj[k]
        if (v instanceof Object) continue; 
        let f = gen_field_meta(k, v, withtype)
        if (!first) {
            meta += ','
        } else {
            first = false
        }
        meta += f
    }

    meta += ')'
    return meta
}

function gen_value(obj) {
    let value = '('
    let first = true
    for (var k in obj) {
        let v = obj[k]
        if (first) {
            first = false
        } else {
            value += ','
        }
        if (typeof(v) == 'string') {
            value += `'${v}'`
        } else {
            value += v
        }
    }

    return value + ')'
}

async function save_table(db, name, value) {
    let table_meta = gen_meta(value[0], true)
    let value_meta = gen_meta(value[0])
    await run(db, `create table ${name}${table_meta}`)
    for (var row of value) {
        let value_str = gen_value(row)
        await run(db, `insert into ${name} ${value_meta} values ${value_str}`)
    }
}

async function clear(path) 
{
    let db = await connect(path)
    await drop_tables(db)
    db.close()
}

async function save(obj, path) {
    let db = await connect(path)
    await drop_tables(db)
    for (var k in obj) {
        let v = obj[k]
        if (!(v instanceof Array)) continue;
        if (v.length == 0 || !(v[0] instanceof Object)) continue;
        await save_table(db, k, v)
    }
    db.close()
}

async function insert(db, name, obj) {
    let value_meta = gen_meta(obj)
    let value_str = gen_value(row)
    await run(db, `insert into ${name} ${value_meta} values ${value_str}`)
}


module.exports = { connect, run, all, load, save, clear, insert}

/*
async function main() {
    let data = await load('bot.db')
    console.log(data, data.alias.length)
    await save(data, 'bot.db')
}

main()

*/
