const admin = require("firebase-admin");
const CONST = require('../constants');
const serviceAccount = require(`../../${CONST.ServiceAccountJSON}`);
const Web3 = require('web3');
const BN = require('bn.js')
const web3Http = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${CONST.INFURA_KEY}`))

const getSlackNoti = require('../shared').getSlackNoti
const slackNoti = getSlackNoti()

// error
const { GetNullTrxError, FailGetConfirmationsError, TrxStatusFalseError } = require('../ErrorClasses');
///

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


const getConfirmations = async (web3, txhash) => {
    try {
        // Get transaction details
        const trx = await web3.eth.getTransactionReceipt(txhash)
        if(trx != null && trx.status !== true) {
            let e = new TrxStatusFalseError(`trx(${txhash}) status is not true! at ${new Date()}`)
            throw e;
        }
        
        // Get current block number
        const currentBlock = await web3.eth.getBlockNumber()

        // When transaction is unconfirmed, its block number is null.
        // In this case we return 0 as number of confirmations
        if(trx != null) {
            return trx.blockNumber == null ? 0 : currentBlock - trx.blockNumber
        } else {
            let e = new GetNullTrxError(`cannot get trx(${txhash})! trx is null! at ${new Date()}`)
            throw e;
        }
    } catch (e) {
        if(e instanceof GetNullTrxError) {
            throw e;
        } else if(e instanceof TrxStatusFalseError) {
            throw e;
        }
        else {
            let e = new FailGetConfirmationsError(`getConfirmations(${txhash}) fail (maybe network issue)! at ${new Date()}`)
            throw e;
        }
    }
}


const main = async () => {
    const intervalFunc = () => {
        db.collection("depositEvent").where("status", '==', "unconfirmed").get()
        .then(snap => {
            snap.forEach(async doc => {
                const segments = doc._ref._path.segments;
                const collKey = segments[0];
                const docKey = segments[1];
                const hDocRef = db.collection(collKey).doc(docKey)
                if(doc.exists) {
                    if(doc.data() && doc.data().transactionHash) {
                        const txhash = doc.data().transactionHash;
                        let confirmations = null;
                        try {
                            confirmations = await getConfirmations(web3Http, txhash);
                        } catch(e) {
                            if(e instanceof GetNullTrxError && doc.data().GetNullTrxErrorCount >= CONST.GetNullTrxErrorCountThresh) {
                                console.log(e)
                                slackNoti(`${e.toString()}`)
                                try {
                                    await db.runTransaction(trans => {
                                        return trans.get(hDocRef).then(doc => {
                                            const data = doc.data();
                                            if(data) {
                                                // const hStatus = data.status;
                                                let newStatus = 'GetNullTrxError';
                                                trans.update(hDocRef, {
                                                    status: newStatus
                                                })
                                            }
                                        })
                                    })
                                } catch(e) {
                                    let errMsg = `in confirmCheck.js, GetNullTrxError transaction error (${txhash})! ${e.toString()}`
                                    console.log(errMsg)
                                    slackNoti(errMsg)
                                }
                                
                            }
                            if(e instanceof GetNullTrxError && doc.data().GetNullTrxErrorCount < CONST.GetNullTrxErrorCountThresh) {
                                try {
                                    await db.runTransaction(trans => {
                                        return trans.get(hDocRef).then(doc => {
                                            const data = doc.data();
                                            const newGetNullTrxErrorCount = data.GetNullTrxErrorCount + 1
                                            if(data) {
                                                trans.update(hDocRef, {
                                                    GetNullTrxErrorCount: newGetNullTrxErrorCount
                                                })
                                            }
                                        })
                                    })
                                } catch(e) {
                                    let errMsg = `in confirmCheck.js, GetNullTrxErrorCount transaction error (${txhash})! ${e.toString()}`
                                    console.log(errMsg)
                                    slackNoti(errMsg)
                                }
                            }
                        }
                        if(confirmations != null) {
                            console.log(`${txhash} confirm#: ${confirmations}`)
                            console.log("")
                            try {
                                await db.runTransaction(trans => {
                                    return trans.get(hDocRef).then(doc => {
                                        const data = doc.data();
                                        if(data) {
                                            const newConfirmation = confirmations;
                                            let newStatus = data.status;
                                            if(newConfirmation >= CONST.minConfNumb) {
                                                newStatus = 'confirmed';
                                            }
                                            trans.update(hDocRef, {
                                                confirmation: newConfirmation,
                                                status: newStatus
                                            })
                                        }
                                    })
                                })
                            } catch(e) {
                                let errMsg = `in confirmCheck.js, newStatus:confirmed transaction error (${txhash})! ${e.toString()}`
                                console.log(errMsg)
                                slackNoti(errMsg)
                            }
                            
                        }
                        
                    }
                }
            })
        })
        .catch(e => {
            console.log(e);
        })
    }
    const mainInterval = setInterval(intervalFunc, 1000*30)
}

main()