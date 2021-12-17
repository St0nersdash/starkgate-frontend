import {number, uint256} from 'starknet';

import {web3} from '../web3';

const {uint256ToBN, bnToUint256} = uint256;
const {toBN} = number;

const TEN_BASE = 10;
const DEFAULT_DECIMALS = 18;

export const powerOf = decimals => Math.pow(TEN_BASE, decimals);

export const toDecimals = (value, decimals = DEFAULT_DECIMALS) => value * powerOf(decimals);

export const fromDecimals = (value, decimals = DEFAULT_DECIMALS) => value / powerOf(decimals);

export const starknet_fromFelt = value => toBN(value).toNumber();

export const starknet_toFelt = value => toBN(value).toString();

export const starknet_toUint256 = (value, decimals) => {
  const decimalsString = String(toDecimals(value, decimals));
  const bn = number.toBN(decimalsString);
  const uint256 = bnToUint256(bn);
  return {
    type: 'struct',
    ...uint256
  };
};

export const starknet_fromUint256 = (value, decimals) => {
  const bnString = uint256ToBN(value).toString();
  return fromDecimals(bnString, decimals);
};

export const eth_toWei = value => web3.utils.toWei(value, 'ether');

export const eth_fromWei = value => Number(web3.utils.fromWei(value));
