import { Client } from 'coinbase';

class CoinbaseClient {
  client: any;
  apiKey: string;
  apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    this.init();
  }

  init(): void {
    this.client = new Client({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
    });
  }


  /**
   * request send money method.
   *
   * @param { String } to
   * @param { String } amount
   * @param { String } currency
   * @param { String } description
   * @returns { Transaction || Error }
   */
  public sendMoney(to: string, amount: string, currency: string, description: string = ''): Promise<any> {
    return new Promise( ( resolve, reject ) => {
      this.client.sendMoney({
        to,
        amount,
        currency,
        description,
      }, function(err, txn) {
        if ( err ) {
          reject( err );
        }
        resolve( txn );
      });
    });
  }

  /**
   * check coin price method.
   *
   * @param { String } pair
   * @returns { data }
   */
  public getBuyPrice(pair: string): Promise<any> {
    return new Promise( ( resolve, reject ) => {
      this.client.getBuyPrice({
        currencyPair: pair,
      }, function(err, obj) {
        if ( err ) {
          reject( err );
        }
        resolve( obj );
      });
    });
  }

}

module.exports = function (apiKey: string, apiSecret: string) {
  return new CoinbaseClient(apiKey, apiSecret);
};
