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
        if (error.response.data.message) {
          console.log("response error : ", error.response.data.message);
        } else if (error.request.message) {
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
    };

    this.debug = false;

    //Contants

    this.orderParams = {
      variety: {
        regular: "regular",
        amo: "amo",
        co: "co",
        iceberg: "iceberg",
        auction: "auction",
      },
      order_type: {
        MARKET: "MARKET",
        LIMIT: "LIMIT",
        SL: "SL",
        "SL-M": "SL-M",
      },
      product: {
        CNC: "CNC",
        NRML: "NRML",
        MIS: "MIS",
      },
      validity: {
        DAY: "DAY",
        IOC: "IOC",
        TTL: "TTL",
      },
      transaction_type: {
        BUY: "BUY",
        SELL: "SELL",
      },
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
   */
  async place_order(params) {
    if (
      !params.variety ||
      !params.tradingsymbol ||
      !params.exchange ||
      !params.transaction_type ||
      !params.order_type ||
      !params.quantity ||
      params.quantity == 0 ||
      !params.product
    ) {
      console.log("place order params missing");
      return;
    }

    orderparam = {
      tradingsymbol,
    };
  }
}

export default KiteWoAPI;
