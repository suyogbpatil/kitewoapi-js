import axios from "axios";
import fs from "fs";

const filepath = "./instruments.csv";

function loadFileData() {
  try {
    const filedata = fs.readFileSync(filepath, "utf-8");
    const csvdata = filedata.toString().replace(/"/g, "").split("\n");

    const headers = csvdata[0].split(",");
    const jsondata = [];
    csvdata.forEach((line) => {
      const l = line.trim().split(",");
      const obj = {};
      headers.forEach((key, i) => {
        let value = l[i];
        if (key.includes("strike" || key.includes("lot_size")) && !isNaN(value)) {
          value = parseFloat(value);
        }
        obj[key.trim()] = value;
      });
      jsondata.push(obj);
    });
    return jsondata;
  } catch (error) {
    console.log("error loading data ", error);
  }
}

async function DownloadInstruments() {
  try {
    const startTime = performance.now();
    const resp = await axios.get("https://api.kite.trade/instruments", {
      responseType: "document",
    });
    const instruments = resp.data;
    fs.writeFileSync(filepath, instruments);
    const endTime = performance.now();
    const downloadTime = endTime - startTime;
    console.log(`instruments dowloaded in ${downloadTime.toFixed(2)} ms`);
  } catch (error) {
    console.log("error downloading instruments ", error.message);
  }
}

function FileOldOrNotExits(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const modifiedTime = stats.mtime;
    const checkTime = new Date();
    console.log("checktime", checkTime);
    checkTime.setHours(8, 30, 0, 0);
    console.log(modifiedTime.toLocaleString(), checkTime.toLocaleString());
    return modifiedTime < checkTime;
  } catch (error) {
    if (error.code === "ENOENT") {
      return true; // File does not exist
    } else {
      throw error; // Some other error occurred
    }
  }
}

async function CheckInstruments() {
  try {
    const downloadfile = FileOldOrNotExits(filepath);
    console.log("check file", downloadfile);
    if (downloadfile) {
      await DownloadInstruments();
    }
  } catch (error) {
    console.log("downloading file error", error);
    return null;
  }
}

function FindInstrument(params, loadedfile = null) {
  const filedata = loadedfile ? loadedfile : loadFileData();

  const instrumentdata = filedata.filter((scrip) => {
    return Object.keys(params).every((key) => {
      if (params[key] === "" || !params[key]) {
        return true;
      }
      return scrip[key] === params[key];
    });
  });
  const al = instrumentdata?.length;

  if (!al) {
    return null;
  }
  return al === 1 ? instrumentdata[0] : instrumentdata;
}

/**
 *
 * @param {{exchange : "NFO"|"MCX"|"CDS",name:"",name:"",instrument_type : "EQ"|"FUT"|"CE"|"PE"}} params
 * @returns {Array} ExpiryDates
 */
function GetExpiryDates(params, loadedfile = null) {
  const filedata = loadedfile ? loadedfile : loadFileData();

  if (!filedata) {
    console.log("file data null");
    return null;
  }
  if (!params?.exchange || !params?.name || !params?.instrument_type) {
    console.log("instrumenttype or name or exchange missing");
    return null;
  }

  const filteredData = filedata.filter((item) => {
    return (
      item.exchange === params.exchange &&
      item.name === params.name &&
      item.instrument_type.startsWith(params.instrument_type)
    );
  });

  const uniqueExpiryDates = new Set(filteredData.map((item) => item.expiry));
  const sortedExpiryDates = Array.from(uniqueExpiryDates).sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA - dateB;
  });

  return sortedExpiryDates;
}

/**
 *
 * @param {{price : 0,name:"",expiry:"",instrument_type : "CE"|"PE",maxStrikes:5}} params
 * @returns {{atmStrike:"",upStrikes:[],downStrikes:[]}}
 */
function GetOptionStrikes(params, loadedfile = null) {
  try {
    const { price = 0, name = "", expiry = "", instrument_type = "", maxStrikes = 5 } = params; // Maximum number of strikes to return for ITM and OTM}

    if (!price || !name || !expiry || !instrument_type) {
      throw new Error("inputs mising");
    }
    const filedata = loadedfile ? loadedfile : loadFileData();
    const optiontype = "CE";
    // Filter strikes based on parameters and option type
    const filteredStrikes = filedata.filter((inst) => {
      return inst.name === name && inst.expiry === expiry && inst.instrument_type === instrument_type;
    });

    // Calculate ATM, ITM, and OTM strikes
    const sortedStrikes = filteredStrikes
      .map((inst) => ({
        strike: inst.strike,
        diff: Math.abs(inst.strike - price),
      }))
      .sort((a, b) => a.diff - b.diff);

    const atmStrike = sortedStrikes.slice(0, 1).map((item) => item.strike)[0]; // ATM strike

    const downStrikes = sortedStrikes
      .filter((item) => item.strike < price && item.strike !== atmStrike && item.strike < atmStrike)
      .slice(0, maxStrikes)
      .map((item) => item.strike); // ITM strikes

    const upStrikes = sortedStrikes
      .filter((item) => item.strike > price && item.strike !== atmStrike && item.strike > atmStrike)
      .slice(0, maxStrikes)
      .map((item) => item.strike); // OTM strikes

    return { atmStrike, downStrikes, upStrikes };
  } catch (error) {
    console.log(error.message);
    return null;
  }
}

export default KiteInst = {
  loadFileData,
  CheckInstruments,
  FindInstrument,
  GetOptionStrikes,
  GetExpiryDates,
};
