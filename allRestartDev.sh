#!/bin/bash
pm2 restart logScan_dev
pm2 restart confirmCheck_dev
pm2 restart balanceUpdate_dev
pm2 restart unconfirmedDepositWatcher_dev

pm2 restart withdrawTxTrigger_dev
pm2 restart withdrawLogScan_dev
pm2 restart unconfirmedWithdrawWatcher_dev

pm2 restart walConTransWatcher_dev

