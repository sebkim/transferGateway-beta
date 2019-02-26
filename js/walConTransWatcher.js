


const admin = require("firebase-admin");
const serviceAccount = require("../kerasiosdev-firebase-adminsdk-5k15q-bf25ba0ffc.json");
const Web3 = require('web3');
const BN = require('bn.js')
const _ = require('lodash');
const web3Http = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/G6jiWFDK2hiEfZVJG8w1'))
const moment = require('moment');
const CONST = require('./constants');

// mongo
const mongoose = require('mongoose');
require('./models/User');
mongoose.Promise = global.Promise;
mongoose.connect(`mongodb://${CONST.MONGO_USER}:${CONST.MONGO_PASS}@${CONST.MONGO_URI}`, {useNewUrlParser: true});
const User = mongoose.model('users')

// sendgrid
const Mailer = require('./services/Mailer');
const notiTemplate = require('./services/emailTemplates/notiTemplate');

// socketio
const express = require('express');
const app = express()
const http = require('http').Server(app);
const io = require('socket.io')(http);

const getSlackNoti = require('./shared').getSlackNoti
const slackNoti = getSlackNoti()

const { addressMapperAddr } = require('./shared')

const safeFromBlockGuard30Days = CONST.safeFromBlockGuard30Days

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kerasiosdev.firebaseio.com"
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);

const getTransferEvents = async (web3, fromBlock, addressMapperAddr, ethAccount, uid) => {
    const keccakTopic = web3.utils.keccak256("DoMapAuto(address,bytes32,string)");
    let hUid = web3.utils.padRight(web3.utils.fromAscii(uid), 64)
    let hEthAccount = web3.utils.padLeft(ethAccount, 64)
    let events = null;
    try {
        events = await web3.eth.getPastLogs({
            fromBlock,
            toBlock: 'latest',
            address: addressMapperAddr,
            topics: [keccakTopic, hEthAccount, hUid]
        })
    } catch(err) {
        console.log(err)
    }
    if(events == null) return null
    else return events
}

const main = () => {
    const colName = 'walConTransLogs'
    const intervalFunc = async () => {
        let currentBlock = await web3Http.eth.getBlockNumber();
        db.collection(colName).where("status", '==', "pending").get()
        .then(snap => {
            snap.forEach(async doc => {
                // console.log(doc.data())
                const { ethAccount, status, uid } = doc.data()
                const docId = doc.id
                let events = await getTransferEvents(web3Http, currentBlock - safeFromBlockGuard30Days, addressMapperAddr, ethAccount, uid)
                if(events == null || _.isEqual(events, [])) {
                    return
                } else {
                    User.findById(uid, async (err, user) => {
                        if(err) {
                            let errMsg = `mongo findById(${uid}) fails in walConTransWatcher. ${err.toString()}`
                            slackNoti(errMsg)
                        } else {
                            if(user.isNotiEmailWalCon) {
                                const email = user.email
                                const content = `Wallet (${ethAccount}) Connection is completed.`
                                const mailer = new Mailer({ subject: 'Wallet connection went successful.', recipients: [email] }, notiTemplate(email, content))
                                mailer.send()
                                .catch(e => {
                                    let errMsg = `sendgrid (${email}) fails in walConTransWatcher. ${e.toString()}`
                                    slackNoti(errMsg)
                                })
                            }
                            if(user.isNotiWebWalCon) {
                                // io.of('walConTrans').emit(`${uid}`, `${ethAccount}`)
                                io.emit(`${uid}`, `${ethAccount}`)
                            }
                            db.collection(colName).doc(docId).delete()
                            // balance fromAddrs add due to wallet connection
                            const balanceDocRef = db.collection("balances").doc(uid)
                            try {
                                await db.runTransaction(trans => {
                                    return trans.get(balanceDocRef).then(async doc => {
                                        if(!doc.exists) {
                                        } else {
                                            let loweredEthAccount = ethAccount.toLowerCase()
                                            let oldFromAddrs = doc.data().fromAddrs;
                                            let newFromAddrs = oldFromAddrs.slice()
                                            if((new Set(oldFromAddrs)).has(loweredEthAccount)) {
    
                                            } else {
                                                newFromAddrs.push(loweredEthAccount)
                                            }
                                            trans.update(balanceDocRef, {
                                                fromAddrs: newFromAddrs
                                            })
                                        }
                                    })
                                })
                            } catch(e) {
                                let errMsg = `in walConTransWatcher.js, fromAddrs update transaction error ${uid}, ${ethAccount}! ${e.toString()}`
                                console.error(errMsg)
                                slackNoti(errMsg)
                            }
                            ///
                        }
                    })
                }
            })
        })
        .catch(e => {
            console.log(e.toString())
        })
    }
    const mainIterval = setInterval(intervalFunc, 1000 * 30)
    // intervalFunc()
    // const mainIterval = setInterval(intervalFunc, 1000 * 10)

    // remove old unProcessed
    const unconfirmIntervalFunc = async () => {
        let nowD = moment().utc()
        let dSomeAgo = moment(nowD)
        dSomeAgo.subtract(2, 'hours')
        // dSomeAgo.subtract(2, 'minutes')

        db.collection(colName).where('status', '==', 'pending').where('createdAt', '<', dSomeAgo.toDate()).get()
        .then(snap => {
            snap.forEach(doc => {
                let errMsg = `in walConTransWatcher.js (unconfirmIntervalFunc), ${nowD.toDate()}, uid(${doc.data().uid}), ethAccount(${doc.data().ethAccount}), pending too long!`
                // slackNoti(errMsg)
                console.error(errMsg)
                db.collection(colName).doc(doc.id).delete()
            })
        })
    }
    const unconfirmInterval = setInterval(unconfirmIntervalFunc, 1000 * 60 * 60) // 1 hour
    // unconfirmIntervalFunc()
}
main()

io.on('connection', function (socket) {
    
});

http.listen(5008, function(){
    console.log('listening on *:5008');
});