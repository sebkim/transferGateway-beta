const admin = require("firebase-admin");
const Web3 = require('web3');
const BN = require('bn.js')
const CONST = require('../constants');
const serviceAccount = require(`../../${CONST.ServiceAccountJSON}`);
const web3Http = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${CONST.INFURA_KEY}`))

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

// addressMapper contract
const addressMapperJSON = require("../../buildJSON/AddressMapper.json")
const addressMapper = new web3Http.eth.Contract(addressMapperJSON.abi, CONST.addrMapperAddress)
const getRegisteredAccount = async (addressMapper, fromAddr) => {
    let loweredFromAddr = fromAddr.toLowerCase()
    try {
        const account = await addressMapper.methods.mapper(loweredFromAddr).call()
        if(account === '') throw new Error("account is empty!")
        return account
    } catch(e) {
        throw e
    }
}
///

// // error
// const { GetNullTrxError, FailGetConfirmationsError, TrxStatusFalseError } = require('../ErrorClasses');
// ///

const ercAddress = CONST.ercAddress
// almost # of blocks that corresponsds to 24 hours
const safeFromBlockGuard = CONST.safeFromBlockGuard

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: CONST.FbDatabaseURL
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);

const main = async () => {
    const intervalFunc = () => {
        db.collection("depositEvent").where("status", '==', "confirmed").get()
        .then(snap => {
            snap.forEach(async doc => {
                const segments = doc._ref._path.segments;
                const collKey = segments[0];
                const docKey = segments[1]; // here, docKey is txhash
                const depositDocRef = db.collection(collKey).doc(docKey)
                const varsDocRef = db.collection('vars').doc('lastConfirmedSafeCommit')
                if(doc.exists) {
                    if(doc.data()) {

                        let account = null
                        let tokenAmount = null
                        let balanceDocRef = null
                        let fromAddr = null

                        if(doc.data().optionalSubType == null) {
                            const rawTokenAmount = doc.data().data
                            tokenAmount = new BN(rawTokenAmount.slice(2), 16)
                            const rawTopics = doc.data().topics;
                            fromAddr = '0x' + rawTopics[1].slice(26)
                            try {
                                account = await getRegisteredAccount(addressMapper, fromAddr)
                            } catch(e) {
                                slackNoti(`in balanceUpdate.js, txhash(${docKey}) getRegisteredAccount fail! ${e.toString()}`)
                                return;
                            }
                            balanceDocRef = db.collection("balances").doc(account)
                            // console.log(`${docKey}: ${fromAddr}: ${account}: ${tokenAmount.toString()}`)
                            // console.log("")
                        } else if(doc.data().optionalSubType === 'crowdsaleAndDepo') {
                            const rawData = doc.data().data
                            tokenAmount = new BN(rawData.slice(2+64, 2+64+64), 16)
                            const rawTopics = doc.data().topics;
                            fromAddr = '0x' + rawTopics[1].slice(26)
                            account = doc.data().gqUid
                            balanceDocRef = db.collection("balances").doc(account)
                        } else {
                            // no op
                            return
                        }
                        
                        // do balanceUpdate
                        try {
                            await db.runTransaction(trans => {
                                return trans.get(balanceDocRef).then(async balanceDoc => {
                                    let newValue = null;
                                    let oldValue = null;
                                    if(!balanceDoc.exists) {
                                        newValue = tokenAmount
                                        let whenNewFromAddr = []
                                        if(doc.data().optionalSubType == null) {
                                            whenNewFromAddr.push(fromAddr)
                                        }
                                        trans.set(balanceDocRef, {
                                            value: newValue.toString(),
                                            lock: false,
                                            fromAddrs: whenNewFromAddr
                                        })
                                    } else {
                                        oldValue = new BN(balanceDoc.data().value)
                                        newValue = oldValue.add(tokenAmount)
                                        let oldFromAddrs = balanceDoc.data().fromAddrs;
                                        let newFromAddrs = oldFromAddrs.slice()
                                        if((new Set(oldFromAddrs)).has(fromAddr)) {

                                        } else {
                                            if(doc.data().optionalSubType == null) {
                                                newFromAddrs.push(fromAddr)
                                            }
                                        }
                                        trans.update(balanceDocRef, {
                                            value: newValue.toString(),
                                            fromAddrs: newFromAddrs
                                        })
                                    }
                                    if(oldValue == null) oldValue = new BN(0)
                                    trans.update(depositDocRef, {
                                        status: 'deposited',
                                        prevAllBalance: oldValue.toString()
                                    })
                                })
                            })
                        } catch(e) {
                            let errMsg = `in balanceUpdate.js, transaction error (${docKey})! ${e.toString()}`
                            slackNoti(errMsg)
                        }

                        // send noti email, socketio emit
                        if(account !== 'crowdsale') {
                            User.findById(account, (err, user) => {
                                if(err) {
                                    let errMsg = `mongo findById(${account}) fails in balanceUpdate(depo). ${err.toString()}`
                                    slackNoti(errMsg)
                                } else {
                                    if(user.isNotiEmailDeposit) {
                                        const email = user.email
                                        const content = `Deposit ${balanceFormatter(tokenAmount.toString(), 2)} is completed.`
                                        const mailer = new Mailer({ subject: 'Deposit transaction went successful.', recipients: [email] }, notiTemplate(email, content))
                                        mailer.send()
                                        .catch(e => {
                                            let errMsg = `sendgrid (${email}) fails in balanceUpdate(depo). ${e.toString()}`
                                            slackNoti(errMsg)
                                        })
                                    }
                                    if(user.isNotiWebDeposit) {
                                        // io.of('keraDepo').emit(`${account}`, `${account}`, `${tokenAmount.toString()}`)
                                        io.emit(`${account}`, `${account}`, `${tokenAmount.toString()}`)
                                    }
                                }
                            })
                        }
                        ///

                        // lastConfirmedSafeCommit
                        const hBlockNumber = doc.data().blockNumber;
                        if(hBlockNumber == null) {
                            slackNoti(`txhash(${docKey}) blockNumber is null! Must check this log!`)
                            return;
                        }
                        try {
                            await db.runTransaction(trans => {
                                return trans.get(varsDocRef).then(doc => {
                                    let oldLastConfirmedSafeCommit
                                    let rejectMsg = "cannot read lastConfirmedSafeCommit!"
                                    if(!doc.exists) {
                                        slackNoti(`txhash(${docKey}) lastConfirmedSafeCommit doc in firestore not exist! Must check this log!`)
                                        return Promise.reject(rejectMsg)
                                    } else {
                                        oldLastConfirmedSafeCommit = doc.data().value;
                                    }
                                    if(oldLastConfirmedSafeCommit == null) {
                                        slackNoti(`txhash(${docKey}) lastConfirmedSafeCommit value is null! Must check this log!`)
                                        return Promise.reject(rejectMsg)
                                    }
                                    let newLastConfirmedSafeCommit = Math.max(oldLastConfirmedSafeCommit, hBlockNumber);
                                    trans.set(varsDocRef, {
                                        value: newLastConfirmedSafeCommit
                                    })
                                })
                            })
                        } catch(e) {
                            let errMsg = `in balanceUpdate.js(lastConfirmedSafeCommit), transaction error (${docKey})! ${e.toString()}`
                            slackNoti(errMsg)
                        }
                        ///
                    }
                }
            })
        })
        .catch(e => {
            console.log(e)
        })
        
    }
    const mainInterval = setInterval(intervalFunc, 1000*30)
    // intervalFunc()
}

main()

http.listen(CONST.BALANCE_UPDATE_PORT, function(){
    console.log(`listening on *:${CONST.BALANCE_UPDATE_PORT}`);
});