const admin = require("firebase-admin");
const HDWalletProvider = require('truffle-hdwallet-provider');
const serviceAccount = require("../../kerasiosdev-firebase-adminsdk-5k15q-bf25ba0ffc.json");
const Web3 = require('web3');
const BN = require('bn.js')
const ERC20JSON = require("../../buildJSON/ERC20Capped.json")
const KerasiosWalletJSON = require("../../buildJSON/KerasiosWallet.json")
const fs = require('fs-extra');
const path = require('path')
const CONST = require('../constants');

const getSlackNoti = require('../shared').getSlackNoti
const slackNoti = getSlackNoti()

const mnemonic = fs.readFileSync(path.resolve(__dirname, '../../mnemonic.txt'), 'utf8')

// provider
const provider = new HDWalletProvider(
    mnemonic,
    `https://mainnet.infura.io/v3/${CONST.INFURA_KEY}`,
    0
);
const web3 = new Web3(provider)
///

// // error
// const { GetNullTrxError, FailGetConfirmationsError, TrxStatusFalseError } = require('../ErrorClasses');
// ///

const ercAddress = CONST.ercAddress
const tokenContract = new web3.eth.Contract(ERC20JSON.abi, ercAddress)
const walletContract = new web3.eth.Contract(KerasiosWalletJSON.abi, CONST.kerasiosWalletAddress)
// # of blocks that corresponsds to 24 hours
const safeFromBlockGuard = CONST.safeFromBlockGuard

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kerasiosdev.firebaseio.com"
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);

const main = async () => {
    const accounts = await web3.eth.getAccounts()
    console.log(accounts)
    const intervalFunc = () => {
        const lockDocRef = db.collection('vars').doc('keraWallet_lock')
        lockDocRef.get()
        .then(doc => {
            if(doc.exists) {
                if(doc.data() && doc.data().bool != null && doc.data().bool === false) {
                    db.collection("withdrawEvent").where("status", '==', "unconfirmed").orderBy('createdAt', 'asc').get()
                    .then(async snap => {
                        const docs = snap.docs;
                        if(docs.length > 0) {
                            const doc = docs[0]
                            const segments = doc._ref._path.segments;
                            const collKey = segments[0];
                            const docKey = segments[1];
                            const hDocRef = db.collection(collKey).doc(docKey)
                            if(doc.exists) {
                                if(doc.data().amount != null && doc.data().amount !== '' && doc.data().toAddr != null && doc.data().toAddr !== '' && web3.utils.isAddress(doc.data().toAddr)) {
                                    let { toAddr, amount } = doc.data()
                                    let hData = web3.utils.fromAscii(docKey)

                                    const encodedABI = tokenContract.methods.transferWithData(toAddr, amount, hData).encodeABI()
                                    walletContract.methods.submitTransaction(ercAddress, 0, encodedABI).send({
                                        from: accounts[0],
                                        gasPrice: '30000000000',
                                        gas: '600000'
                                    })
                                    .then(async receipt => {
                                        let receiptObject = JSON.parse(JSON.stringify(receipt))
                                        db.collection('withdrawReceipt').add({
                                            ...receiptObject,
                                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                        })
                                    })
                                    .catch(e => {
                                        let errMsg = `in withdrawTxTrigger.js, walletContract submitTransaction error! ${docKey}: ${e.toString()}`
                                        slackNoti(errMsg)
                                        console.log(errMsg)
                                    })

                                    // important part!!! it must not fail!
                                    const sleep = (ms) => {
                                        return new Promise((resolve, reject) => {
                                            setTimeout(resolve, ms)
                                        })
                                    }
                                    let retries = 3
                                    let success = false
                                    while(retries-- > 0 && success === false) {
                                        try {
                                            await db.runTransaction(trans => {
                                                return trans.get(hDocRef).then(doc => {
                                                    let newStatus = 'waitForLog'
                                                    trans.update(hDocRef, {
                                                        status: newStatus
                                                    })
                                                    trans.update(lockDocRef, {
                                                        bool: true
                                                    })

                                                })
                                            })
                                            success = true
                                        } catch(e) {
                                            let errMsg = `in withdrawTxTrigger.js, transaction error retry#${retries}! ${docKey}: ${e.toString()}`
                                            slackNoti(errMsg)
                                            console.log(errMsg)
                                            if(retries === 0) {
                                                console.log("Emergency!!! process exit with code 1!")
                                                process.exit(1)
                                            }
                                        }
                                        await sleep(1000)
                                    }
                                    ///
                                }
                            } else {

                            }
                        }
                    })
                    .catch(e => {
                        console.log(e.toString())
                    })
                }
            }
        })
        .catch(e => {
            console.log(e.toString())
        })
    }
    // const mainInterval = setInterval(intervalFunc, 1000*120)
    const mainInterval = setInterval(intervalFunc, 1000*30)
    // intervalFunc()
    // const mainInterval = setInterval(intervalFunc, 1000*15)
}

main()