import { Idashboard } from "./interfaces/Idashboard";
// import {EStatus} from './interfaces/enums/EStatus';
import { table, getBorderCharacters } from "table";
import Fastify from "fastify";
import cors from "@fastify/cors";
import moment from "moment";
import * as http from "http";
import * as https from "https";
import K8s from "k8s";
import fs from "fs";
import timestamp from "time-stamp";

let k8sBinary: any = 'kubectl';
process.on("unhandledRejection", (error: Error, promise) => {
    console.log(error);
});
process.on("uncaughtException", function (error, origin) {
    console.log(error);
});

const CryptoJS = require("crypto-js");
let k = `j@mesbond`; // j@mesbond

const fastify = Fastify();

let app = fastify;
fastify.register(cors, {
    // put your options here
});
const tcpPortUsed = require("tcp-port-used");
const mongoose = require("mongoose");
// mongoose.set('useFindAndModify', false);
const boom = require("boom");
const bodyParser = require("body-parser");
const hostname = "0.0.0.0";
const port = 8008;
let k8sModel = require("./k8s.model");
let db = 'mongodb://service-owl:ecivreS8002lwO@192.168.120.135:27017/k8s-owl?authSource=admin';
// let db = "mongodb://admin:admin@192.168.10.166:32717/k8s-api-BE?authSource=admin";
// let db = 'mongodb://localhost:27017/k8s-api-BE?authSource=admin';
let allData = [];
let nodemailer = require("nodemailer");

// mongoose.Promise = global.Promise;

mongoose
    .connect(db, {
        // promiseLibrary: Promise,
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log(`MongoDB Connected: ${db}`))
    .catch(console.error);

app.listen({ port: port, host: hostname }, function () {
    console.log(`k8s-owl-BE app listen at : http://${hostname}:${port}`);
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

app.get("/", (req, res) => {
    res.send(`k8s-api-BE is up and running...`);
});

app.get("/clusters", async (req, res) => {
    try {
        let clusters = await k8sModel.find({});
        res.send({ data: getEncryptedData(clusters) });
    } catch (e) {
        res.status(500);
    }
});

//post
app.post("/clusters/cluster-save", async (req: any, res) => {
    try {
        // let tempData = JSON.parse(req.body.data);
        let tempData = JSON.parse(getDecryptedData(req.body.data));
        let saved = await k8sModel.create(tempData);
        res.send(saved);
        getAllClusterData();
    } catch (e) {
        console.log(e);
        res.status(500);
        res.send({ message: e.message });
    }
});

//get byId
app.get("/clusters/:postId", async (req: any, res) => {
    try {
        let post = await k8sModel.findOne({ _id: req.params.postId });
        res.send(post);
    } catch (e) {
        res.status(500);
    }
});

//update
app.put("/clusters/update", async (req: any, res) => {
    try {
        // let tempData = JSON.parse(req.body.data);
        let tempData = JSON.parse(getDecryptedData(req.body.data));
        let id = getDecryptedData(req.body.id);
        let post = await k8sModel.findByIdAndUpdate({ _id: id }, tempData, {
            new: true,
            runValidator: true,
        });
        getAllClusterData();
        res.send(post);
    } catch (e) {
        res.status(500);
    }
});

//delete
app.post("/clusters/cluster-delete", async (req: any, res) => {
    try {
        let post = await k8sModel.findByIdAndRemove({
            _id: req.body.data,
        });
        res.send(post);
    } catch (e) {
        res.status(500);
    }
});

let resData;
const getDataFromCluster = async (groupId, clusterId) => {
    let allData: Idashboard[] = <any>(
        await k8sModel
            .find({ groupId })
            .select("_id groupName clusters")
            .lean()
            .exec()
    );
    allData = JSON.parse(JSON.stringify(allData));
    let resDataPromiseArr: Promise<any>[] = [];
    resDataPromiseArr.push(
        new Promise<void>(async (resolve, reject) => {
            //   https://github.com/Goyoo/node-k8s-client


            for (let item = 0; item < allData.length; item++) {
                for (let clusterItem = 0; clusterItem < allData[item].clusters.length; clusterItem++) {
                    if (allData[item].clusters[clusterItem]._id === clusterId) {
                        // console.log(allData[item].clusters[clusterItem]._id);
                        let kubectl = await K8s.kubectl({
                            binary: k8sBinary,
                            kubeconfig: `./kubeconfigfiles/${allData[item].clusters[clusterItem].clusterName}.yaml`,
                            version: "/api/v1",
                        });
                        await kubectl.pod.list(function (err, pods) {
                            let unSortData = <any>[];
                            try {
                                let Data = JSON.parse(JSON.stringify(pods));
                                // console.log(Data.items)
                                for (let index = 0; index < Data.items.length; index++) {
                                    // console.log(Data.items[index]);
                                    // resData.push({
                                    //     "APP": Data.items[index].metadata.labels.app,
                                    //     "PNAME": Data.items[index].metadata.name,
                                    //     "STATUS": Data.items[index].status.phase,
                                    //     "NODE": Data.items[index].spec.nodeName,
                                    //     "AGE": Data.items[index].status.startTime,
                                    // });
                                    for (let indexOne = 0; indexOne < Data.items[index].status.containerStatuses.length; indexOne++) {
                                        // console.log(Data.items[index].status);
                                        let podTimeStamp = Data.items[index].status.startTime;
                                        // console.log('PodTime: '+podTimeStamp + ' =>', 'CurrentTime: ' + timestamp.utc('YYYY-MM-DDTHH-mm-ssZ'));


                                        let diffYears = Math.abs(parseInt(podTimeStamp.slice(0,4)) - parseInt(timestamp.utc('YYYY')));
                                        let diffMonths = Math.abs((parseInt(podTimeStamp.slice(5,7)) - parseInt(timestamp.utc('MM'))) * 30);
                                        let diffDays = Math.abs(diffMonths - parseInt(podTimeStamp.slice(8,10)) + parseInt(timestamp.utc('DD')));
                                        let diffHours = Math.abs((24 - parseInt(podTimeStamp.slice(11,13))) - (24 - parseInt(timestamp.utc('HH'))));
                                        let diffMins = Math.abs((60 - parseInt(podTimeStamp.slice(14,16))) - (60 - parseInt(timestamp.utc('mm'))));
                                        let diffSecs = Math.abs((60 - parseInt(podTimeStamp.slice(17,19))) - (60 - parseInt(timestamp.utc('ss'))));

                                        let Y = diffYears;
                                        // let M = diffMonths;
                                        let D = diffDays;
                                        let h = diffHours;
                                        let m = diffMins;
                                        let s = diffSecs;

                                        // if (h > 24) {
                                        //     if (h > 48) {
                                        //         D = D+2;
                                        //         // h = 0;
                                        //     } else {
                                        //         D = D+1;
                                        //         // h = 0;
                                        //     }
                                        // } 

                                        let YDisplay = Y > 0 ? Y + (Y == 1 ? "y" : "y") : "";
                                        let DDisplay = D > 0 ? D + (D == 1 ? "d" : "d") : "";
                                        let hDisplay = h > 0 ? h + (h == 1 ? "h" : "h") : "";
                                        let mDisplay = m > 0 ? m + (m == 1 ? "m" : "m") : "";
                                        let sDisplay = s > 0 ? s + (s == 1 ? "s" : "s") : "";


                                        // console.log(diffYears , diffMonths , diffDays , diffHours , diffMins , diffSecs );

                                        unSortData.push({
                                            "APP": Data.items[index].status.containerStatuses[indexOne].name,
                                            "PNAME": Data.items[index].metadata.name,
                                            "RESTARTS": Data.items[index].status.containerStatuses[indexOne].restartCount,
                                            "NODE": Data.items[index].spec.nodeName,
                                            // "AGE": Data.items[index].status.startTime,
                                            // "AGE": `${diffYear}y${diffMonth}m${diffDay}d${diffHour}h${diffMin}m${diffSec}s`,
                                            "AGE": `${YDisplay}${DDisplay}${hDisplay}${mDisplay}${sDisplay}`,
                                            "READY": Data.items[index].status.containerStatuses[indexOne].ready,
                                        });
                                        // console.log(resData);
                                    }
                                }
                                resData = unSortData.sort((a: any, b:any) => (a.AGE > b.AGE) ? 1 : -1);
                            } catch (err) {
                                let resData = <any>[];
                                console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 404");
                                resData.push({
                                    "APP": "No Response",
                                    "PNAME": "No Response",
                                    // "STATUS": "No Response",
                                    "RESTARTS": "No Response",
                                    "NODE": "No Response",
                                    "AGE": "No Response",
                                    "READY": "No Response",
                                });
                                console.error(err.error);
                                resolve();
                            }
                        });

                        // kubectl.node.list(function(err, nodes){
                        //     resData = JSON.parse(JSON.stringify(nodes));
                        //     console.log(resData)
                        // })
                    }

                }

            }
            resolve();
        })
    );
    await Promise.all(resDataPromiseArr);
    return resData;
};
let resLogs = <any>[];

const getLogsFromPod = async (groupId, clusterId, podName, h?) => {
    let allData: Idashboard[] = <any>(
        await k8sModel
            .find({ groupId })
            .select("_id groupName clusters")
            .lean()
            .exec()
    );
    allData = JSON.parse(JSON.stringify(allData));
    let resLogsPromiseArr: Promise<any>[] = [];
    resLogsPromiseArr.push(
        new Promise<void>(async (resolve, reject) => {
            //   https://github.com/Goyoo/node-k8s-client
            for (let item = 0; item < allData.length; item++) {
                for (let clusterItem = 0; clusterItem < allData[item].clusters.length; clusterItem++) {
                    if (allData[item].clusters[clusterItem]._id === clusterId) {
                        // console.log(allData[item].clusters[clusterItem]._id);
                        let kubectl = await K8s.kubectl({
                            binary: k8sBinary,
                            kubeconfig: `./kubeconfigfiles/${allData[item].clusters[clusterItem].clusterName}.yaml`,
                            version: "/api/v1",
                        });
                        try {
                            if (h) {
                                await kubectl.pod.logs(`${podName} --since=${h}`).then(function(log){
                                    resLogs = [];
                                    resLogs = log;
                                }).catch(function(err){console.log(err)});
                            } else {
                                await kubectl.pod.logs(`${podName}`).then(function(log){
                                    resLogs = [];
                                    resLogs = log;
                                }).catch(function(err){console.log(err)});
                            }
                        } catch (error) {
                            console.log(error); 
                        }

                        // kubectl.node.list(function(err, nodes){
                        //     resData = JSON.parse(JSON.stringify(nodes));
                        //     console.log(resData)
                        // })
                    }

                }

            }
            resolve();
        })
    );
    await Promise.all(resLogsPromiseArr);
    return resLogs;
};
let appLogs = <any>[];

const getLogsFromApp = async (groupId, clusterId, appName?, lines?) => {
    let allData: Idashboard[] = <any>(
        await k8sModel
            .find({ groupId })
            .select("_id groupName clusters")
            .lean()
            .exec()
    );
    allData = JSON.parse(JSON.stringify(allData));
    let appLogsPromiseArr: Promise<any>[] = [];
    appLogsPromiseArr.push(
        new Promise<void>(async (resolve, reject) => {
            //   https://github.com/Goyoo/node-k8s-client
            for (let item = 0; item < allData.length; item++) {
                for (let clusterItem = 0; clusterItem < allData[item].clusters.length; clusterItem++) {
                    if (allData[item].clusters[clusterItem]._id === clusterId) {
                        // console.log(allData[item].clusters[clusterItem]._id);
                        let kubectl = await K8s.kubectl({
                            binary: k8sBinary,
                            kubeconfig: `./kubeconfigfiles/${allData[item].clusters[clusterItem].clusterName}.yaml`,
                            version: "/api/v1",
                        });
                        try {
                            if (lines) {
                                await kubectl.pod.logs(`--tail=${lines} -lapp=${appName}`).then(function(log){
                                    appLogs = [];
                                    appLogs = log;
                                }).catch(function(err){console.log(err)});
                            } else {
                                await kubectl.pod.logs(`--tail=-1 -lapp=${appName}`).then(function(log){
                                    appLogs = [];
                                    appLogs = log;
                                }).catch(function(err){console.log(err)});
                            }
                        } catch (error) {
                            console.log(error); 
                        }
                    }
                }
            }
            resolve();
        })
    );
    await Promise.all(appLogsPromiseArr);
    return appLogs;
};

let deletePodresData = <any>[];
const deletePod = async (groupId, clusterId, podName) => {
    let allData: Idashboard[] = <any>(
        await k8sModel
            .find({ groupId })
            .select("_id groupName clusters")
            .lean()
            .exec()
    );
    allData = JSON.parse(JSON.stringify(allData));
    let resLogsPromiseArr: Promise<any>[] = [];
    resLogsPromiseArr.push(
        new Promise<void>(async (resolve, reject) => {
            //   https://github.com/Goyoo/node-k8s-client
            for (let item = 0; item < allData.length; item++) {
                for (let clusterItem = 0; clusterItem < allData[item].clusters.length; clusterItem++) {
                    if (allData[item].clusters[clusterItem]._id === clusterId) {
                        // console.log(allData[item].clusters[clusterItem]._id);
                        let kubectl = await K8s.kubectl({
                            binary: k8sBinary,
                            kubeconfig: `./kubeconfigfiles/${allData[item].clusters[clusterItem].clusterName}.yaml`,
                            version: "/api/v1",
                        });
                        try {
                            await kubectl.pod.delete(`${podName}`).then(function(data: any){
                                deletePodresData = [];
                                deletePodresData = data;
                            }).catch(function(err: any){console.log(err)});
                        } catch (error) {
                            console.log(error); 
                        }
                    }
                }
            }
            resolve();
        })
    );
    await Promise.all(resLogsPromiseArr);
    return deletePodresData;
};

app.get("/clusters/:groupId/:clusterId/pods", async (req: any, res) => {
    try {
        getAllClusterData();
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        res.send(await getDataFromCluster(groupId, clusterId));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 200");
    } catch (e) {
        res.status(500);
    }
});


app.get("/clusters/:groupId/:clusterId/:podName/:h", async (req: any, res) => {
    try {
        getAllClusterData();      
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let podName = req.params.podName;
        let h = req.params.h;
        res.send(await getLogsFromPod(groupId, clusterId, podName, h));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName + ` => Get ${h} Pod Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

app.get("/clusters/:groupId/:clusterId/:podName", async (req: any, res) => {
    try {
        getAllClusterData();      
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let podName = req.params.podName;
        let h = req.params.h;
        res.send(await getLogsFromPod(groupId, clusterId, podName));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName + " => Get Full Pod Logs Res: 200");
    } catch (e) {
        res.status(500);
    }
});

app.get("/clusters/:groupId/:clusterId/:appName/:lines/AppLogs", async (req: any, res) => {
    try {
        getAllClusterData();      
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let appName = req.params.appName;
        let lines = req.params.lines;
        res.send(await getLogsFromApp(groupId, clusterId, appName, lines));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'AppName: ' + appName + ` => Get ${lines} App Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

app.get("/clusters/:groupId/:clusterId/:appName/AppLogs", async (req: any, res) => {
    try {
        getAllClusterData();      
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let appName = req.params.appName;
        let lines = req.params.lines;
        res.send(await getLogsFromApp(groupId, clusterId, appName));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'AppName: ' + appName + ` => Get Full App Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

//deletePod
app.delete("/clusters/:groupId/:clusterId/:podName/deletePod", async (req: any, res) => {
    let groupId = req.params.groupId;
    let clusterId = req.params.clusterId;
    let podName = req.params.podName;
    try {
        res.send(await deletePod(groupId, clusterId, podName));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName + " => Pod deleted Res: 200");
    } catch (e) {
        res.status(500);
    }
});

async function getAllClusterData() {
    let getCluster: Idashboard[] = <any>(
        await k8sModel.find({}).select("groupName clusters").lean().exec()
    );
    getCluster = JSON.parse(JSON.stringify(getCluster));
    // console.log(getCluster);
    let clustersPromiseArr: Promise<any>[] = [];
    for (let item of getCluster) {
        clustersPromiseArr.push(
            new Promise<void>(async (resolve, reject) => {
                for (let i = 0; i < item.clusters.length; i++) {
                    //   console.log(item.clusters[i]);
                    let fileName = `./kubeconfigfiles/${item.clusters[i].clusterName}.yaml`;
                    const content = item.clusters[i].kubeConfig;
                    fs.writeFile(fileName, content, (err2) => {
                        if (err2) {
                            console.log(err2);
                            return;
                        }
                    });
                }
                resolve();
            })
        );
        await Promise.all(clustersPromiseArr);
    }
}
// getAllClusterData();

module.exports = app;
