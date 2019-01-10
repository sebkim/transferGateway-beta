const admin = require("firebase-admin");
const serviceAccount = require("../../kerasiosdev-firebase-adminsdk-5k15q-bf25ba0ffc.json");
const Web3 = require('web3');
const BN = require('bn.js')
const web3Http = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/G6jiWFDK2hiEfZVJG8w1'))
const CONST = require('../constants');

const getSlackNoti = require('../shared').getSlackNoti
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
    databaseURL: "https://kerasiosdev.firebaseio.com"
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
                        const rawTokenAmount = doc.data().data
                        const tokenAmount = new BN(rawTokenAmount.slice(2), 16)
                        const rawTopics = doc.data().topics;
                        const fromAddr = '0x' + rawTopics[1].slice(26)
                        let account = null;
                        try {
                            account = await getRegisteredAccount(addressMapper, fromAddr)
                        } catch(e) {
                            slackNoti(`in balanceUpdate.js, txhash(${docKey}) getRegisteredAccount fail! ${e.toString()}`)
                            return;
                        }
                        const balanceDocRef = db.collection("balances").doc(account)
                        console.log(`${docKey}: ${fromAddr}: ${account}: ${tokenAmount.toString()}`)
                        console.log("")
                        try {
                            await db.runTransaction(trans => {
                                return trans.get(balanceDocRef).then(async doc => {
                                    let newValue = null;
                                    if(!doc.exists) {
                                        newValue = tokenAmount
                                        trans.set(balanceDocRef, {
                                            value: newValue.toString(),
                                            lock: false,
                                            fromAddrs: [fromAddr]
                                        })
                                    } else {
                                        let oldValue = new BN(doc.data().value)
                                        newValue = oldValue.add(tokenAmount)
                                        let oldFromAddrs = doc.data().fromAddrs;
                                        let newFromAddrs = oldFromAddrs.slice()
                                        if((new Set(oldFromAddrs)).has(fromAddr)) {

                                        } else {
                                            newFromAddrs.push(fromAddr)
                                        }
                                        trans.update(balanceDocRef, {
                                            value: newValue.toString(),
                                            fromAddrs: newFromAddrs
                                        })
                                    }
                                    trans.update(depositDocRef, {
                                        status: 'deposited'
                                    })
                                })
                            })
                            // lastConfirmedSafeCommit
                            const hBlockNumber = doc.data().blockNumber;
                            if(hBlockNumber == null) {
                                slackNoti(`txhash(${docKey}) blockNumber is null! Must check this log!`)
                                return;
                            }
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
                            ///
                        } catch(e) {
                            let errMsg = `in balanceUpdate.js, transaction error (${docKey})! ${e.toString()}`
                            console.log(errMsg)
                            slackNoti(errMsg)
                        }
                        
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