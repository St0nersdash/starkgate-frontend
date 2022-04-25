import {useCallback} from 'react';

import {initiateWithdraw, withdraw} from '../api/bridge';
import {
  ActionType,
  CompleteTransferToL1Steps,
  stepOf,
  TransactionStatus,
  TransferError,
  TransferStep,
  TransferToL1Steps
} from '../enums';
import {useWithdrawalListener} from '../providers/EventManagerProvider';
import {useL1Token} from '../providers/TokensProvider';
import {useSelectedToken} from '../providers/TransferProvider';
import {useL1Wallet, useL2Wallet} from '../providers/WalletsProvider';
import utils from '../utils';
import {useL1TokenBridgeContract, useTokenBridgeContract} from './useContract';
import {useLogger} from './useLogger';
import {useCompleteTransferToL1Tracking, useTransferToL1Tracking} from './useTracking';
import {useTransfer} from './useTransfer';
import {useTransferProgress} from './useTransferProgress';

export const useTransferToL1 = () => {
  const logger = useLogger('useTransferToL1');
  const [trackInitiated, trackSuccess, trackError] = useTransferToL1Tracking();
  const {account: l1Account} = useL1Wallet();
  const {account: l2Account, config: l2Config} = useL2Wallet();
  const selectedToken = useSelectedToken();
  const getTokenBridgeContract = useTokenBridgeContract();
  const {handleProgress, handleData, handleError} = useTransfer(TransferToL1Steps);
  const progressOptions = useTransferProgress();

  return useCallback(
    async amount => {
      const {decimals, bridgeAddress, name, symbol} = selectedToken;

      const sendInitiateWithdraw = () => {
        trackInitiated({
          from_address: l2Account,
          to_address: l1Account,
          amount,
          symbol
        });
        const bridgeContract = getTokenBridgeContract(bridgeAddress);
        return initiateWithdraw({
          recipient: l1Account,
          contract: bridgeContract,
          amount,
          decimals
        });
      };

      try {
        logger.log('TransferToL1 called');
        handleProgress(
          progressOptions.waitForConfirm(
            l2Config.name,
            stepOf(TransferStep.CONFIRM_TX, TransferToL1Steps)
          )
        );
        logger.log('Calling initiate withdraw');
        const {transaction_hash: l2hash} = await sendInitiateWithdraw();
        logger.log('Tx hash received', {l2hash});
        handleProgress(
          progressOptions.initiateWithdraw(
            amount,
            symbol,
            stepOf(TransferStep.INITIATE_WITHDRAW, TransferToL1Steps)
          )
        );
        logger.log('Waiting for tx to be received on L2');
        await utils.blockchain.starknet.waitForTransaction(l2hash, TransactionStatus.RECEIVED);
        logger.log('Done', {l2hash});
        trackSuccess(l2hash);
        handleData({
          type: ActionType.TRANSFER_TO_L1,
          sender: l2Account,
          recipient: l1Account,
          name,
          symbol,
          amount,
          l2hash
        });
      } catch (ex) {
        logger.error(ex.message, ex);
        trackError(ex);
        handleError(progressOptions.error(TransferError.TRANSACTION_ERROR, ex));
      }
    },
    [
      l1Account,
      l2Account,
      getTokenBridgeContract,
      handleData,
      handleError,
      handleProgress,
      logger,
      progressOptions,
      selectedToken,
      l2Config
    ]
  );
};

export const useCompleteTransferToL1 = () => {
  const logger = useLogger('useCompleteTransferToL1');
  const {account: l1Account, config: l1Config} = useL1Wallet();
  const {handleProgress, handleData, handleError} = useTransfer(CompleteTransferToL1Steps);
  const progressOptions = useTransferProgress();
  const getL1Token = useL1Token();
  const getL1TokenBridgeContract = useL1TokenBridgeContract();
  const {addListener, removeListener} = useWithdrawalListener();
  const [trackInitiated, trackSuccess, trackError, trackReject] = useCompleteTransferToL1Tracking();

  return useCallback(
    async transfer => {
      const {symbol, amount, l2hash} = transfer;

      const sendWithdrawal = () => {
        trackInitiated({
          to_address: l1Account,
          l2hash,
          amount,
          symbol
        });
        const {bridgeAddress, decimals} = getL1Token(symbol);
        const tokenBridgeContract = getL1TokenBridgeContract(bridgeAddress);
        return withdraw({
          recipient: l1Account,
          contract: tokenBridgeContract,
          emitter: onTransactionHash,
          amount,
          decimals
        });
      };

      const onTransactionHash = (error, transactionHash) => {
        if (error) {
          onError(error);
        } else {
          logger.log('Tx signed', {transactionHash});
          handleProgress(
            progressOptions.withdraw(
              amount,
              symbol,
              stepOf(TransferStep.WITHDRAW, CompleteTransferToL1Steps)
            )
          );
        }
      };

      const onWithdrawal = (error, event) => {
        if (error) {
          onError(error);
        } else {
          const {transactionHash: l1hash} = event;
          logger.log('Done', l1hash);
          trackSuccess(l1hash);
          handleData({...transfer, l1hash});
        }
      };

      const onError = error => {
        removeListener();
        trackError(error);
        logger.error(error?.message, error);
        handleError(progressOptions.error(TransferError.TRANSACTION_ERROR, error));
      };

      try {
        logger.log('CompleteTransferToL1 called');
        handleProgress(
          progressOptions.waitForConfirm(
            l1Config.name,
            stepOf(TransferStep.CONFIRM_TX, CompleteTransferToL1Steps)
          )
        );
        addListener(onWithdrawal);
        logger.log('Calling withdraw');
        await sendWithdrawal();
      } catch (ex) {
        onError(ex);
      }
    },
    [
      l1Account,
      l1Config,
      getL1Token,
      getL1TokenBridgeContract,
      handleData,
      handleError,
      handleProgress,
      logger,
      progressOptions,
      addListener,
      removeListener
    ]
  );
};
