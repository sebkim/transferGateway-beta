const admin = require("firebase-admin");
const CONST = require('../constants');
const serviceAccount = require(`../../${CONST.ServiceAccountJSON}`);
const Web3 = require('web3');
const BN = require('bn.js')
const web3Http = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${CONST.INFURA_KEY}`))

const getSlackNoti = require('../shared').getSlackNoti
const slackNoti = getSlackNoti()

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

const getLastConfirmedSafeCommit = async (db) => {
    const varsRef = db.collection("vars")
    try {
        let doc = await varsRef.doc('lastConfirmedSafeCommit').get()
        if(doc.exists && doc.data().value) {
            return doc.data().value
        }
        else return null
    } catch(err) {
        return null
    }
}

const getTransferEvents = async (web3, fromBlock, ercAddress) => {
    const keccakTopic = web3.utils.keccak256("Transfer(address,address,uint256)");
    const mywallet = web3.utils.padLeft(CONST.kerasiosWalletAddress, 64)
    let events = null;
    try {
        events = await web3.eth.getPastLogs({
            fromBlock,
            toBlock: 'latest',
            address: ercAddress,
            topics: [keccakTopic, null, mywallet]
        })
    } catch(err) {
        console.log(err)
    }
    if(events == null) return null
    else return events
}

// let tokenAmount = new BN(eventObject.data.slice(2), 16)
const putLogs = (db, events, timeout) => {
    return new Promise((resolve, reject) => {
        const transDone = new Array(events.length).fill(false);

        const putEachLog = (event, transInd) => {
            let eventObject = JSON.parse(JSON.stringify(event));
            const depositRef = db.collection('depositEvent')
            depositRef.doc(eventObject.transactionHash).get()
            .then(doc => {
                const transDoneFunc = () => {
                    transDone[transInd] = true;
                }
                if(doc.exists) {
                    depositRef.doc(eventObject.transactionHash).update(eventObject)
                    .then(transDoneFunc)
                    .catch(err => {
                        
                    })
                } else {
                    depositRef.doc(eventObject.transactionHash).set({
                        confirmation: 0,
                        status: 'unconfirmed',
                        GetNullTrxErrorCount: 0,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        ...eventObject,
                        tokenAmount: (new BN(eventObject.data.slice(2), 16)).toString(),
                        fromAddr: '0x' + eventObject.topics[1].slice(26)
                    }, { merge: true })
                    .then(transDoneFunc)
                    .catch(err => {

                    })
                }
            })
        };
        
        let i;
        let event = null;
        for(i = 0; i < events.length; i++) {
            event = events[i];
            putEachLog(event, i)
        }

        var startTime = new Date().getTime();
        var hInterval = setInterval(() => {
            if(transDone.every(val => {
                if(val === true) return true;
                else return false;
            })) {
                clearInterval(hInterval);
                resolve(true);
            } else {
                if(new Date().getTime() - startTime > timeout) {
                    clearInterval(hInterval);
                    resolve(false);
                }
            }
        }, 1000)
    })
}

const main = async () => {
    const intervalFunc = async () => {
        // get lastConfirmedSafeCommit
        const lastConfirmedSafeCommit = await getLastConfirmedSafeCommit(db);
        if(lastConfirmedSafeCommit == null) {
            let errMsg = `cannot get lastConfirmedSafeCommit from firestore! at ${new Date()}`
            console.log(errMsg)
            slackNoti(errMsg)
            return;
        }
        ///

        // get transfer events
        let events = await getTransferEvents(web3Http, lastConfirmedSafeCommit - safeFromBlockGuard, ercAddress)
        if(events == null) {
            let errMsg = `cannot getPastLogs from infura https! at ${new Date()}`
            console.log(errMsg)
            slackNoti(errMsg)
            return;
        }
        ///

        // put logs
        let putLogsRes = await putLogs(db, events, 1000 * 30);
        if(putLogsRes === true) {

        } else {
            let errMsg = `putLogs fail! at ${new Date()}`
            console.log(errMsg)
            slackNoti(errMsg)
        }
        ///

        // debug lines
        console.log(`date: ${new Date()}`)
        console.log(`lastConfirmedSafeCommit: ${lastConfirmedSafeCommit}`)
        console.log('events length: ', events.length)
        // console.log(events)
        console.log("")        
        ///
    }
    const mainIterval = setInterval(intervalFunc, 1000 * 60)
    // intervalFunc()

}

main()