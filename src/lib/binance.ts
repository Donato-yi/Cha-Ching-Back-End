import Binance from 'binance-api-node';

class BinanceClient {
  client: any;
  apiKey: string;
  apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    this.init();
  }

  init(): void {
    this.client = Binance({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
    });
  }

  /**
   * request withdraw method.
   *
   * @param { String } asset
   * @param { String } address
   * @param { Number } amount
   * @param { String } name?    // Description of the address
   * @param { Number } recvWindow?
   * @returns { "msg": "success", "success": true }
   */
  public async withdraw(asset: string, address: string, amount: number, name?: string, recvWindow?: number): Promise<any> {
    const response = await this.client.withdraw({
      asset,
      address,
      amount,
      name,
      recvWindow,
    });
    return response;
  }

  /**
   * get withdraw history method.
   *
   * @param { String } asset?
   * @param { Number } status?    // 0: Email Sent, 1: Cancelled 2: Awaiting Approval, 3: Rejected, 4: Processing, 5: Failure, 6: Completed
   * @param { Number } startTime?
   * @param { Number } endTime?
   * @param { Number } recvWindow?
   * @returns { "msg": "success", "success": true }
   */
  public async getWithdrawHistory(asset: string, status: string, startTime: number, endTime?: string, recvWindow?: number): Promise<any> {
    const response = await this.client.withdrawHistory({
      asset,
      status,
      startTime,
      endTime,
      recvWindow,
    });
    return response;
  }
}

module.exports = function (apiKey: string, apiSecret: string) {
  return new BinanceClient(apiKey, apiSecret);
};
