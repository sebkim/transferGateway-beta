#!/bin/bash
pm2 restart logScan
pm2 restart confirmCheck
pm2 restart balanceUpdate
pm2 restart unconfirmedDepositWatcher

pm2 restart withdrawTxTrigger
pm2 restart withdrawLogScan
pm2 restart unconfirmedWithdrawWatcher

pm2 restart walConTransWatcher

