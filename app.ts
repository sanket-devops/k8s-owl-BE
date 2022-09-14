import {Idashboard, IPort} from './interfaces/Idashboard';
import {EStatus} from './interfaces/enums/EStatus';
import { table, getBorderCharacters } from 'table';
import Fastify from 'fastify'
import cors from '@fastify/cors'
import moment from 'moment';
import * as http from 'http';
import * as https from 'https';

process.on('unhandledRejection', (error: Error, promise) => {
    console.log(error);
});
process.on('uncaughtException', function(error, origin) {
    console.log(error);
});

const CryptoJS = require('crypto-js');
let k = `j@mesbond`; // j@mesbond

const fastify = Fastify()

let app = fastify;
fastify.register(cors, { 
    // put your options here
  })
const tcpPortUsed = require('tcp-port-used');
const mongoose = require('mongoose');
// mongoose.set('useFindAndModify', false);
const boom = require('boom');
const bodyParser = require('body-parser');
const hostname = '0.0.0.0';
const port = 8002;
let owlModel = require('./owl.model');
let db = 'mongodb://service-owl:ecivreS8002lwO@192.168.120.135:27017/service-owl?authSource=admin';
// let db = 'mongodb://admin:admin@192.168.10.166:32717/service-owl?authSource=admin';
// let db = 'mongodb://localhost:27017/service-owl?authSource=admin';
let allData = [];
let nodemailer = require('nodemailer');

// mongoose.Promise = global.Promise;

mongoose.connect(db, {
    // promiseLibrary: Promise,
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log(`MongoDB Connected: ${db}`)).catch(console.error);


app.listen({port: port, host: hostname}, function () {
    console.log(`service-owl app listen at : http://${hostname}:${port}`)
});

function getEncryptedData(data: any) {
    let encryptMe;
    if (typeof data === 'object') encryptMe = JSON.stringify(data);
    return CryptoJS.AES.encrypt(encryptMe, k).toString();
}

function getDecryptedData(ciphertext: any) {
    let bytes = CryptoJS.AES.decrypt(ciphertext, k);
    return bytes.toString(CryptoJS.enc.Utf8);
}

let counter = 1;
let isOwlChekcing: boolean;
const allServiceHost = async () => {
    console.log(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< Start =>`, counter,`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
    isOwlChekcing = true;
    let startDate = new Date().getTime();
    let allData: Idashboard[] = <any>await owlModel.find({}).select('ipAddress hostName port hostCheck').lean().exec();
    allData = JSON.parse(JSON.stringify(allData));
    let servicesPromiseArr: Promise<any>[] = [];
    // loop services
    for (let item of allData) {
        if (item.hostCheck === true) {
            servicesPromiseArr.push(new Promise<void>(async (resolve, reject) => {
                let upCount = 0;

                let downCount = 0;
                let portsPromiseArr: Promise<any>[] = [];
                for (let i = 0; i < item.port.length; i++) {
                    portsPromiseArr.push(new Promise<void>(async (resolve, reject) => {
                        let portObj = item.port[i];
                        let isUp;
                        let isHttpUp;
                        let httpCheck = {
                            hostname: item.ipAddress,
                            port: portObj.port,
                            path: portObj.path,
                            method: portObj.method,
                            timeout: 10000
                          };
                        // let httpCheck = {
                        //     hostname: '192.168.130.183',
                        //     port: 8888,
                        //     path: '/',
                        //     method: 'GET',
                        //     timeout: 10000
                        //   };
                        try {
                            if (portObj.http) {
                                const __ret = await setHttpStatus(portObj, httpCheck, isHttpUp, item);
                                isHttpUp = __ret.isHttpUp;
                                if (isHttpUp) {
                                    portObj.status = 'UP'
                                } else {
                                    console.log(`Http Watching: '${item.ipAddress}' Port '${portObj.port}'.`);
                                    for (let index = 0; index < 23; index++) {
                                        const __ret = await setHttpStatus(portObj, httpCheck, isHttpUp, item);
                                        isHttpUp = __ret.isHttpUp;
                                        if (isHttpUp) {
                                            break;
                                        }
                                    }
                                    if (isHttpUp) {
                                        portObj.status = 'UP'
                                        console.log(`Http Checker: UP Found '${item.ipAddress}' Port '${portObj.port}'.`);
                                    } else {
                                        portObj.status = 'DOWN'
                                        console.log(`Http Checker: DOWN Found '${item.ipAddress}' Port '${portObj.port}'.`);
                                    }
                                }
                            } else {
                                try {
                                    isUp = await tcpPortUsed.check(portObj.port, item.ipAddress);
                                    portObj.status = 'UP'
                                } catch (error) {
                                    try {
                                        console.log(`Port Watching '${item.ipAddress}' Port '${portObj.port}'.`);
                                        await tcpPortUsed.waitUntilUsedOnHost(portObj.port, item.ipAddress, 10000, 60000 * 4); // wait for 5 minute to
                                        portObj.status = 'UP'
                                        console.log(`Port Checker: UP Found '${item.ipAddress}' Port '${portObj.port}'.`);
                                    } catch (error) {
                                        portObj.status = 'DOWN'
                                        console.log(`Port Checker: DOWN Found '${item.ipAddress}' Port '${portObj.port}'.`);
                                    }
                                }
                            }
                            if (portObj.status === 'UP') {
                                upCount++;
                            } else {
                                downCount++;
                            }
                        } catch (error) {
                            console.log(error)
                        }
                        resolve();
                    }));
                }
                await Promise.all(portsPromiseArr);
                await owlModel.findOneAndUpdate({_id: item._id}, {$set: {port: item.port}}).exec();

                if (upCount === item.port.length) await owlModel.findOneAndUpdate({_id: item._id}, {$set: {status: 'UP'}}).exec();
                else if (downCount === item.port.length) await owlModel.findOneAndUpdate({_id: item._id}, {$set: {status: 'DOWN'}}).exec();
                else if (upCount !== item.port.length && downCount !== item.port.length) await owlModel.findOneAndUpdate({_id: item._id}, {$set: {status: 'S_DOWN'}}).exec();
                resolve();
            }));
        }else {
            console.log(`Skip Host '${item.hostName}' '${item.ipAddress}' HostCheck is '${item.hostCheck}'.`);
        }
    }
    await Promise.all(servicesPromiseArr);
    await compareStatus();

    let endDate = new Date().getTime();
    console.log(`${moment().format('DD-MM-YYYY hh:mm:ss A Z')} : Data Refreshed in ${(endDate - startDate) / 1000}`);
    isOwlChekcing = false;
    console.log(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< Stop =>`, counter++,`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
}
// setTimeout(allServiceHost(), 10000);
setInterval(allServiceHost, 60000 * 5);
allServiceHost();


app.get('/', (req, res) => {
    res.send(`service-owl is up and running...`);
})

app.get('/hosts', async (req, res) => {
    try {
        let hosts = await owlModel.find({});
        res.send({data: getEncryptedData(hosts)});
    } catch (e) {
        res.status(500);
    }
});

// app.get('/hosts/latestPull', async (req, res) => {
//     try {
//         let latestPull = allServiceHost();
//         res.send(latestPull);
//     } catch (e) {
//         res.status(500);
//     }
// });

//post
app.post('/hosts/host-save', async (req: any, res) => {
    try {
        let tempData = JSON.parse(getDecryptedData(req.body.data));
        let saved = await owlModel.create(tempData);
        res.send(saved);
    } catch (e) {
        console.log(e);
        res.status(500);
        res.send({message: e.message});
    }
});

//get byId
app.get('/hosts/:postId', async (req: any, res) => {
    try {
        let post = await owlModel.findOne({_id: req.params.postId});
        res.send(post);
    } catch (e) {
        res.status(500);
    }
});

//update
app.put('/hosts/update', async (req: any, res) => {
    try {
        let tempData = JSON.parse(getDecryptedData(req.body.data));
        let id = getDecryptedData(req.body.id);
        let post = await owlModel.findByIdAndUpdate({_id: id}, tempData, {new: true, runValidator: true});
        res.send(post);
        let doUpdate = async() => {
            if (isOwlChekcing) {
                setTimeout(doUpdate, 1000);
            } else {
                await owlModel.findByIdAndUpdate({_id: id}, tempData, {new: true, runValidator: true});
            }
           }
        doUpdate();
    } catch (e) {
        res.status(500);
    }
});

//delete
app.post('/hosts/host-delete', async (req: any, res) => {
    try {
        let post = await owlModel.findByIdAndRemove({
            _id: getDecryptedData(req.body.data)
        });
        res.send(post);
    } catch (e) {
        res.status(500);
    }
});


let localStorageData: Idashboard[];

async function compareStatus() {
    let res: Idashboard[] = JSON.parse(JSON.stringify(await owlModel.find({}).lean().exec()));
    let oldDashboard = localStorageData
    let downHostServices = [];
    if (oldDashboard && oldDashboard.length) {
        let oldStorageMap = getRowsMap(oldDashboard, '_id');
        let changeFound = false;
        let downServices = [];
        for (let item of res) {
            let oldItem: Idashboard = oldStorageMap[item._id];
            if (!oldItem) continue;
            let downPortsList: IPort[] = comparePortsArrAndGetDownServices(oldItem.port, item.port);
            if (downPortsList.length) {
                changeFound = true;
                console.log('Change found in ', item.hostName, " => ", item.ipAddress);
                downServices.push({hostname: item.hostName, host: item.ipAddress, ports: downPortsList});
                // break;
            }
        }
        downServices.forEach(element => {
            downHostServices.push([element.hostname, " => ",element.host]);
            for (let index = 0; index < element.ports.length; index++) {
                downHostServices.push([element.ports[index].name, element.ports[index].port, element.ports[index].status])
            }
            downHostServices.push(["***************", "*****", "***************"]);
        });
        const tableConfig = {
            // border: getBorderCharacters('honeywell'),
            columns: [
              { alignment: 'center'},
              { alignment: 'center'},
              { alignment: 'center'}
            ],
            drawVerticalLine: () => false
        };
        if (changeFound) {
            async function main() {
                // Create a SMTP transporter object
                let transporter = nodemailer.createTransport({
                    host: "192.168.130.80",
                    port: 587,
                    secure: false,
                    auth: {
                        user: 'spatel@operrparking.com',
                        pass: '123@Soon'
                    },
                    tls: {
                        rejectUnauthorized: false
                    },
                    dkim: {
                        domainName: "operrparking.com",
                        keySelector: "dkim",
                        privateKey: '"-----BEGIN RSA PRIVATE KEY-----","MIIEogIBAAKCAQEAxp\/KVTc+tJKt+I2Zrh+tBUeBMfIRTIwGCj2nKi5xzMsphWGQ","fJAg6luD9VUGTx4l304yGF\/5saKgTi8wLJrM7jNrm3a+J8lBpsYDvaxL\/77k4WW3","E9TYBnPgzN3K39cfce+pFOPgOC2FZkwsiiAvE9acV28soHh6H0TEvfcLVYIkP8Np","bQ2adXekMfcnJcAOvnue1aycyWjBNOwCippDVkScdV9Kl3vhZamc1Wa2IncStE6L","v9BNYR5lShZCNODogSzq3rQWBojpSKxQaoGVE5hmMzNl4nkaSo1oK4DX7uW0BTVN","vQQ1alPJBRzvMQ4Ua\/r\/fFnq+oeux42P\/PRGewIDAQABAoIBAF1GwyU7uXXhgFO+","Y9Jyy7Uz\/EcxT9Br3ZZHl85mW0j6i7g4tjrZEKweaBz5Xeof1VdGCJ6Ly94Q6klt","Palk1SJ0AW\/T1r8mc29XhIA5fsNOqXv0YYKtrPlyx7pN2i0+gGToULYfwbeAISqG","UVBYhuNBINCqxAFkMq2mhOJVNvxjOsmVa3sOw2QBjfsFBE4SWwprwOqQYMIGrHYC","nlB0Mt7KNNjhR0LMnITA60sCADxHZsSsh0PH2VfyR2eMJK2jN6nRge44WaYjWJe4","ZQK5UiRp2s3rzoE3XBtsAGArVhGJ2Fhe78kEdmFfAEuzn\/F24sWcaqcjRh0+fwws","4glqsikCgYEA4cTyuwccf1uJ+6bvKbKxhGpHQLA4Oego0k4FPrpYWXtLKmPl+rcz","0Xz9rbZs02mBltyXGistCdnhAxFR\/389Cd31ouk1gzg8HOr09YF5P744ZW3YGC8N","DTfJHh7N49inCdMeP8bGABNPksigbNU2GMCGWZdoiRVrJnIg2MagEV0CgYEA4ThY","WHyqDxeXayK1SE9PLYUIR7O0dNOYsqIR9QFFRW9\/iHv5p\/IELVfHSo9ugkYsx+A9","bc09d+ICAfGJMXwn7jM2yLsKzldhB5joESVq8XIwMJ4Kip74MDffO4zScWwLbXLA","RcigJfhFvBcjwHnhi\/TLArWKMD25rADqVtJogbcCgYBjqG1BE52Htl+NPx35ORDV","E5jKPD9FiG5kjt4P12\/iZ+NBHgHJjw8HnPXZtVoKZFs4vbzRZ1elLpD9qqqYbpEC","BwFD3U+q0arvVOO2b2WXNp9sXnVyD2rid8qGSjC2L89kLdX\/bv290MhiUb9G60LK","4EktyQDy6gp3WQ+YwOytXQKBgAXzu0H7aXMkqHfIXwoeLnWBgoqCkU5VGT\/\/UIIt","GmuPWst8m0h4+OtJ2pZ52+3NdPmDT5xLREiazHrIq1uHcHa3G8eKSerSHFpbDCcH","2h+vaN6gDp9DPEPp9hhYzGb6+AJYegReHP1j5lPmOKepkPBl88eKjLBhsTp+e7L3","tJNZAoGAHbuHB3C0AfoZrT39JPcI+GtM72lPIsiIJqBwIeUAJz7PAiI\/Gv+sMAn\/","l6Riqa+Cx6lAIsXNJQEzNfUVgAt5XutxnokDuwiCRZgmhOSfXmQ2t6359XgERwNC","5lfKsqhl02NJPIWE7Id6iRqQHs6BGX3XJ105RfggRbSmpl0f\/a8=","-----END RSA PRIVATE KEY-----"'
                    }
                });

                // Message object
                let message = {
                    from: 'ServiceOwl <spatel@operrparking.com>',

                    // Comma separated list of recipients
                    to: 'spatel.devops@gmail.com',

                    // bcc: 'andris@ethereal.email',

                    // Subject of the message
                    subject: 'Service is down, Please check the mail for more details.',

                    // plaintext body
                    // text: JSON.stringify(downServices, null, 4),
                    text: table(downHostServices, tableConfig),

                    // HTML body
                    // html:
                    //     '<p><b>Hello</b> to myself <img src="cid:note@example.com"/></p>' +
                    //     '<p>Here\'s a nyan cat for you as an embedded attachment:<br/><img src="cid:nyan@example.com"/></p>',

                    // An array of attachments
                    attachments: [
                        // String attachment
                    ]
                };

                let info = await transporter.sendMail(message);
                console.log('Down Services => Message sent successfully as %s', info.messageId);
                console.log(table(downHostServices));
            }

            main().catch(err => {
                console.error(err.message);
                process.exit(1);
            });
        } else console.log('No change found');
        localStorageData = getDashboardToStore(res);
    } else localStorageData = getDashboardToStore(res);
}

function comparePortsArrAndGetDownServices(oldPorts: IPort[], newPorts: IPort[]): IPort[] {
    let oldPortsMap = getRowsMap(oldPorts, 'port');
    let downPorts: IPort[] = [];
    for (let port of newPorts) {
        let oldPort: IPort = oldPortsMap[port.port];
        if (oldPort) {
            if (oldPort.status !== port.status && (port.status === EStatus.DOWN || port.status === EStatus.S_DOWN)) {
                console.log('Port status changed : ', oldPort.status);
                downPorts.push(port);
            }
        }
    }
    return downPorts;
}

function getDashboardToStore(rows: Idashboard[]): Idashboard[] {
    let arr: Idashboard[] = [];
    for (let row of rows) {
        arr.push(<any><Partial<Idashboard>>{
            _id: row._id,
            port: row.port,
        });
    }
    return arr;
}

function getRowsMap(rows: any[], key: string) {
    let obj: any = {};
    for (let row of rows) obj[row[key]] = row;
    return obj;
}

async function setHttpStatus(portObj, httpCheck: { path: string; hostname: string; method: string; port: any; timeout: number }, isHttpUp, item): Promise<any> {
    return new Promise(async (resolve, reject) => {
        try {
            let isResolveCalled = false;
            let req = http.request(httpCheck, (res) => {
                // console.log(res.statusCode);
                // portObj.statuscode = res.statusCode;
                isHttpUp = true;
                isResolveCalled = true;
                resolve({isHttpUp});
            });
            req.on('timeout', function () {
                // console.log("timeout! " + (httpCheck.timeout / 1000) + " seconds => Req expired: " + item.ipAddress + " Port: " + portObj.port);
                req.destroy();
                if (!isResolveCalled) {
                    isResolveCalled = true;
                    resolve({isHttpUp: false});
                }
            });
            req.on('error', (error: any) => {
                if (error) {
                    // console.error(`Error Http Requst => Errno: ${error.errno} Code: ${error.code} Syscall: ${error.syscall} Hostname: ${error.address} Port: ${error.port}`);
                    setTimeout(function() {
                        if (!isResolveCalled) {
                            isResolveCalled = true;
                            resolve({isHttpUp: false});
                        }
                    },10000);
                } else {
                    setTimeout(function() {
                        if (!isResolveCalled) {
                            isResolveCalled = true;
                            resolve({isHttpUp: false});
                        }
                    },10000);
                }
            });
            req.end();
        } catch (e) {
            setTimeout(function() {
                resolve({isHttpUp: false});
            },10000);
        }
    });

}

module.exports = app;
function resolve(servicesPromiseArr: Promise<any>[]) {
    throw new Error('Function not implemented.');
}

