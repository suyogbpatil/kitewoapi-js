import fs from "fs";
import { TOTP } from "totp-generator";
import axios from "axios";

class KiteWoAPI {
  /**
   * @param {String} user_id AB1234
   * @param {String} password zxsllddid
   * @param {String} totpkey ABCDXDGDGGEEDG
   */
  constructor(user_id, password, totpkey) {
    this.user_id = user_id;
    this.password = password;
    this.totpkey = totpkey;

    this.axiosInstance = axios.create({
      timeout: 7000,
      withCredentials: true,
      withXSRFToken: true,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
    });

    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (config.url.includes(this.rootUrl)) {
          config.headers.Authorization = `enctoken ${this.enctoken}`;
        }
        return config;
      },
      (error) => {
        Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (response.status === 200) {
          if (response.config.url === this.twofaUrl) {
            const enctoken = response.headers["set-cookie"]
              .find((cookie) => cookie.startsWith("enctoken"))
              .split(";")[0]
              .replace("enctoken=", "");

            const jsondata = {
              enctoken,
            };
            this.savedata(jsondata);
            this.enctoken = enctoken;
          }
          return response.data.data;
        } else {
          console.log("status not success", response.data.message);
          return null;
        }
      },
      (error) => {
        if (error.response?.data.message) {
          console.log("response error : ", error.response.data.message);
        } else if (error.request?.message) {
          console.log("request error :", error.request.message);
        } else {
          console.log("other error : ", error.message);
        }
      }
    );

    this.enctoken = "";

    this.loginUrl = "https://kite.zerodha.com/api/login";
    this.twofaUrl = "https://kite.zerodha.com/api/twofa";
    this.rootUrl = "https://api.kite.trade";

    this.urls = {
      user_profile: `${this.rootUrl}/user/profile`,
      user_margins: `${this.rootUrl}/user/margins`,
      orders: `${this.rootUrl}/orders`,
      trades: `${this.rootUrl}/trades`,
      orderinfo: `${this.rootUrl}/orders/:order_id`,
      ordertrades: `${this.rootUrl}/orders/:orderid/trades`,
      place_order: `${this.rootUrl}/orders/:variety`,
      modifiy_order: `${this.rootUrl}/orders/:variety/:order_id`,
      cancel_order: `${this.rootUrl}/orders/:variety/:order_id`,
      hist_candle_data: `${this.rootUrl}/instruments/historical/:instrument_token/:interval`,
      quotes: `${this.rootUrl}/quote`,
      quotes_ohlc: `${this.rootUrl}/quote/ohlc`,
      quotes_ltp: `${this.rootUrl}/quote/ltp`,
    };

    this.debug = false;

    //Contants

    this.exchange = {
      NSE: "NSE",
      BSE: "BSE",
      NFO: "NFO",
      MCX: "MCX",
    };

    this.variety = {
      regular: "regular",
      amo: "amo",
      co: "co",
      iceberg: "iceberg",
      auction: "auction",
    };

    this.order_type = {
      MARKET: "MARKET",
      LIMIT: "LIMIT",
      SL: "SL",
      "SL-M": "SL-M",
    };

    this.product = {
      CNC: "CNC",
      NRML: "NRML",
      MIS: "MIS",
    };

    this.validity = {
      DAY: "DAY",
      IOC: "IOC",
      TTL: "TTL",
    };

    this.transaction_type = {
      BUY: "BUY",
      SELL: "SELL",
    };

    //hist interval
    this.interval = {
      minute: "minute",
      day: "day",
      three_min: "3minute",
      five_min: "5minute",
      ten_min: "10minute",
      fifteen_min: "15minute",
      thirty_min: "30minute",
      sixty_minute: "60minute",
    };
  }

  showError(error) {
    if (this.debug) {
      console.log(error);
    } else {
      console.log(error.message);
    }
  }

  /**
   * @param {Boolean} status "true" | "false"
   */
  setDebug(status = false) {
    this.debug = status;
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  savedata(data) {
    const filedata = JSON.stringify(data);

    fs.writeFileSync("access_token.json", filedata);
  }

  readdata() {
    try {
      const filepath = "./access_token.json";
      if (!fs.existsSync(filepath)) {
        return null;
      }
      const filedata = fs.readFileSync(filepath);
      const data = JSON.parse(filedata);
      return data;
    } catch (err) {
      console.error("Error reading access token:", err);
      return null;
    }
  }

  /**
   * @param {Object} obj
   * @returns urlEncoded Form Data
   */
  convertJ2F(obj) {
    return new URLSearchParams(obj);
  }

  async getEnctoken() {
    try {
      const logindata = this.convertJ2F({ user_id: this.user_id, password: this.password });
      const loginresp = await this.axiosInstance.post(`${this.loginUrl}`, logindata);

      const { otp: totp, expires } = TOTP.generate(this.totpkey);

      const totpdata = new URLSearchParams({
        user_id: this.user_id,
        request_id: loginresp?.request_id,
        twofa_value: totp,
      });

      await this.sleep(1000);

      const twofaResponse = await this.axiosInstance.post(this.twofaUrl, totpdata);
      console.log("success full login", twofaResponse);
    } catch (error) {
      this.showError(error);
    }
  }

  async generateSession() {
    try {
      let generateSession = false;
      if (this.enctoken === "") {
        const data = this.readdata();
        if (data?.enctoken) {
          this.enctoken = data.enctoken;
          const margins = await this.margins();
          if (!margins) {
            generateSession = true;
          }
        } else {
          generateSession = true;
        }
      }

      if (generateSession) {
        console.log("generating new session");
        await this.getEnctoken();
      }
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * Get User Balance and Margin for each segments
   * @returns
   */
  async margins() {
    try {
      return await this.axiosInstance.get(this.urls.user_margins);
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * Gets User Profile
   * @returns
   */
  async profile() {
    try {
      return await this.axiosInstance.get(this.urls.user_profile);
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * Retrieve the list of all orders (open and executed) for the day
   * @returns Array of orders
   */
  async orders() {
    try {
      return await this.axiosInstance.get(this.urls.orders);
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * Retrieve the list of all executed trades for the day
   * @returns Array of trades
   */
  async trades() {
    try {
      return await this.axiosInstance.get(this.urls.trades);
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * @method orderinfo gets order details of given orderid
   * @param {String} orderid
   * @returns
   */
  async orderinfo(orderid = null) {
    try {
      if (!orderid) {
        throw new Error("orderid missing");
      }
      return await this.axiosInstance.get(this.urls.orderinfo.replace(":order_id", orderid));
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * @async
   * @param {Object} params
   * @param {String} params.variety  - Variety
   * @param {String} params.tradingsymbol  - TradingSymbol
   * @param {String} params.exchange  - Exchange
   * @param {String} params.transaction_type  - Transaction Type 'BUY'|'SELL'
   * @param {String} params.order_type - Order Type - "MARKET" | "LIMIT" | "SL" | "SL-M"
   * @param {String} params.quantity - Quantity to be traded
   * @param {String} params.product - Product Type "CNC" | "NRML" | 'MIS'
   * @param {Number} params.price - Price scrip (For LIMIT orders)
   * @param {Number} params.trigger_price The price at which an order should be triggered (SL, SL-M)
   * @param {Number} params.disclosed_quantity Quantity to disclose publicly (for equity trades)
   * @param {String} params.validity Order validity (DAY, IOC and TTL)
   * @param {Number} params.validity_ttl Order life span in minutes for TTL validity orders
   * @param {Number} params.iceberg_legs  Total number of legs for iceberg order type (number of legs per Iceberg should be between 2 and 10)
   * @param {Number} params.iceberg_quantity Split quantity for each iceberg leg order (quantity/iceberg_legs)
   * @param {String} params.auction_number A unique identifier for a particular auction
   * @param {String} params.tag  An optional tag to apply to an order to identify it (alphanumeric, max 20 chars)
   */
  async place_order(params) {
    if (
      !params.variety ||
      !params.tradingsymbol ||
      !params.exchange ||
      !params.transaction_type ||
      !params.order_type ||
      !params.quantity ||
      !params.product
    ) {
      console.log("place order params missing");
      return;
    }

    try {
      return await this.axiosInstance.post(this.urls.place_order.replace(":variety", params.variety), params);
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   *
   * @param {*} params {variety,order_id,...}
   * @returns
   */
  async modifiy_order(params) {
    try {
      if (!params.variety || !params.orderid) {
        console.log("place order params missing");
        return;
      }
      return await this.axiosInstance.put(
        this.urls.modifiy_order.replace(":variety", params.variety).replace(":order_id", params.orderid),
        params
      );
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   *
   * @param {Object} params {variety,order_id}
   * @returns
   */
  async cancel_order(params) {
    try {
      return this.axiosInstance.delete(
        this.urls.cancel_order.replace(":variety", params.variety).replace(":order_id", params.orderid),
        params
      );
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /**
   * @async
   * @medhod To get historical candle data
   * @param {Object} params Object of parameters (instrumenttoken, interval,from,to,continous,io)
   * @param {String} params.instrument_token Instrument Token
   * @param {String} params.interval (minute,day,3minute,5minute,10minute,15minute,30minute,60minute)
   * @param {String} params.from Date in format of 2024-04-01 : 09:15 (yyyy-mm-dd hh:mm:ss)
   * @param {String} params.to Date in format of 2024-04-01 : 09:15:00 (yyyy-mm-dd hh:mm:ss)
   * @param {Boolean} params.continuous Continuous data true or false
   * @param {Boolean} params.oi Get oi data true or false
   */
  async candle_data(params) {
    try {
      if (!params.instrument_token || !params.interval || !params.from || !params.to) {
        console.log("some params missing");
        return;
      }

      const urlparams = {
        from: params.from,
        to: params.to,
        continuous: params.continuous ? 1 : 0,
        oi: params.oi ? 1 : 0,
      };

      const respdata = await this.axiosInstance.get(
        this.urls.hist_candle_data
          .replace(":instrument_token", params.instrument_token)
          .replace(":interval", params.interval),
        {
          params: urlparams,
        }
      );

      // console.log("respdata", respdata.candles);
      if (Array.isArray(respdata.candles)) {
        return respdata.candles.map(([time, open, high, low, close, v, oi = null]) => ({
          time,
          open,
          high,
          low,
          close,
          v,
          oi,
        }));
      } else {
        throw new Error("not array");
      }
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  static convertToQuery = () => {
    return Object.entries(data)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((val) => `i=${key}:${val}`).join("&");
        } else {
          return [`i=${key}:${value}`];
        }
      })
      .join("&");
  };

  /**
   * Function to get full quotes of symbols limit upto 500
   * @param {Object} params {BSE : SENSEX,NSE : ["NIFTY 50","INFY"]}
   * \n Pass array of tradingsymbol of same exchanges
   */
  async quotes(data) {
    try {
      const urlStrings = convertToQuery(data);

      return this.axiosInstance.get(this.urls.quotes + `?${urlStrings}`);
    } catch (error) {
      this.showError(error);
      return null;
    }
  }
}

export default KiteWoAPI;
