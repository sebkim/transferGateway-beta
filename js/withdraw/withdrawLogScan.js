const admin = require("firebase-admin");
const serviceAccount = require("../../kerasiosdev-firebase-adminsdk-5k15q-bf25ba0ffc.json");
const Web3 = require('web3');
const BN = require('bn.js')
const web3Http = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/G6jiWFDK2hiEfZVJG8w1'))
const CONST = require('../constants');

// mongo
const mongoose = require('mongoose');
require('../models/User');
mongoose.Promise = global.Promise;
mongoose.connect(`mongodb://${CONST.MONGO_USER}:${CONST.MONGO_PASS}@${CONST.MONGO_URI}`, {useNewUrlParser: true});
const User = mongoose.model('users')

// sendgrid
const Mailer = require('../services/Mailer');
const notiTemplate = require('../services/emailTemplates/notiTemplate');

// socketio
const express = require('express');
const app = express()
const http = require('http').Server(app);
const io = require('socket.io')(http);

const shared = require('../shared')
const { getSlackNoti, balanceFormatter } = shared
const slackNoti = getSlackNoti()

const ercAddress = CONST.ercAddress
// almost # of blocks that corresponsds to 24 hours
const safeFromBlockGuard = CONST.safeFromBlockGuard
const safeFromBlockGuard30Days = CONST.safeFromBlockGuard30Days

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kerasiosdev.firebaseio.com"
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);


const getTransferEvents = async (web3, fromBlock, ercAddress, walletAddress, autoGenKey) => {
    const keccakTopic = web3.utils.keccak256("TransferWithData(address,address,bytes32,uint256)");
    const mywallet = web3.utils.padLeft(walletAddress, 64)
    let hData = web3.utils.padRight(web3.utils.fromAscii(autoGenKey), 64)
    let events = null;
    try {
        events = await web3.eth.getPastLogs({
            fromBlock,
            toBlock: 'latest',
            address: ercAddress,
            topics: [keccakTopic, mywallet, null, hData]
        })
    } catch(err) {
        console.log(err)
    }
    if(events == null) return null
    else return events
}

const main = async () => {
    const intervalFunc = async () => {
        let currentBlock = await web3Http.eth.getBlockNumber();
        const lockDocRef = db.collection('vars').doc('keraWallet_lock')
        db.collection("withdrawEvent").where("status", '==', "waitForLog").get()
        .then(snap => {
            snap.forEach(async doc => {
                const segments = doc._ref._path.segments;
                const collKey = segments[0];
                const docKey = segments[1];
                const hDocRef = db.collection(collKey).doc(docKey) // withdrawEvent collection
                if(doc.exists) {
                    if(doc.data()) {
                        let events = await getTransferEvents(web3Http, currentBlock - safeFromBlockGuard30Days, ercAddress, CONST.kerasiosWalletAddress, docKey)
                        if(events == null) {
                            let errMsg = `in withdrawLogScan.js, cannot getPastLogs from infura https! at ${new Date()}. ${docKey}`
                            console.log(errMsg)
                            slackNoti(errMsg)
                            return;
                        }
                        if(events[0] == null) {
                            return;
                        }
                        let event = events[0]
                        let eventObject = JSON.parse(JSON.stringify(event))
                        let { toAddr, status: oldStatus, fromAccount, amount } = doc.data()
                        if(oldStatus !== 'waitForLog') {
                            let errMsg = 'in withdrawLogScan.js, oldStatus of withdrawEvent should be waitForLog!'
                            slackNoti(errMsg)
                            return
                        }
                        const balanceDocRef = db.collection('balances').doc(fromAccount)
                        
                        try {
                            await db.runTransaction(trans => {
                                return trans.getAll(hDocRef, balanceDocRef).then(docs => {
                                    const withdrawDoc = docs[0]
                                    const balanceDoc = docs[1]
                                    if(withdrawDoc.data() && balanceDoc.data()) {
                                        if(balanceDoc.data().lock === false) {
                                            return Promise.reject(`balances ${toAddr} now already lock false! `)
                                        }
                                        let newStatus = 'confirmed'
                                        trans.update(hDocRef, {
                                            status: newStatus,
                                            ...eventObject
                                        })
                                        trans.update(balanceDocRef, {
                                            lock: false
                                        })
                                        trans.update(lockDocRef, {
                                            bool: false
                                        })
                                    }
                                })
                            })
                            // send noti email
                            User.findById(fromAccount, (err, user) => {
                                if(err) {
                                    let errMsg = `mongo findById(${fromAccount}) fails in withdrawLogScan. ${err.toString()}`
                                    slackNoti(errMsg)
                                } else {
                                    if(user.isNotiEmailWithdraw) {
                                        const email = user.email
                                        const content = `Withdraw ${balanceFormatter(amount, 2)} is completed.`
                                        const mailer = new Mailer({ subject: 'Withdraw transaction went successful.', recipients: [email] }, notiTemplate(email, content))
                                        mailer.send()
                                        .catch(e => {
                                            let errMsg = `sendgrid (${email}) fails in withdrawLogScan. ${e.toString()}`
                                            slackNoti(errMsg)
                                        })
                                    }
                                    if(user.isNotiWebWithdraw) {
                                        // io.of('keraWithdraw').emit(`${fromAccount}`, `${fromAccount}`, `${amount}`, `${toAddr}`)
                                        io.emit(`${fromAccount}`, `${fromAccount}`, `${amount}`, `${toAddr}`)
                                    }
                                }
                            })
                            ///
                        } catch(e) {
                            console.log(`in withdrawLogScan.js, ${e.toString()}`)
                        }

                    }
                }
            })
        })
        .catch(e => {
            console.log(e.toString())
        })
    }
    const mainIterval = setInterval(intervalFunc, 1000 * 30)
    // intervalFunc()
    // const mainIterval = setInterval(intervalFunc, 1000 * 15)

}

main()

http.listen(5007, function(){
    console.log('listening on *:5007');
});