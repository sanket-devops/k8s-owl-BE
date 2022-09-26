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
// let db = 'mongodb://service-owl:ecivreS8002lwO@192.168.120.135:27017/k8s-api-BE?authSource=admin';
let db = "mongodb://admin:admin@192.168.10.166:32717/k8s-api-BE?authSource=admin";
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
    console.log(`k8s-api-BE app listen at : http://${hostname}:${port}`);
});

// function getEncryptedData(data: any) {
//     let encryptMe;
//     if (typeof data === 'object') encryptMe = JSON.stringify(data);
//     return CryptoJS.AES.encrypt(encryptMe, k).toString();
// }

// function getDecryptedData(ciphertext: any) {
//     let bytes = CryptoJS.AES.decrypt(ciphertext, k);
//     return bytes.toString(CryptoJS.enc.Utf8);
// }

app.get("/", (req, res) => {
    res.send(`k8s-api-BE is up and running...`);
});

app.get("/clusters", async (req, res) => {
    try {
        let clusters = await k8sModel.find({});
        res.send({ data: clusters });
    } catch (e) {
        res.status(500);
    }
});

//post
app.post("/clusters/cluster-save", async (req: any, res) => {
    try {
        // let tempData = JSON.parse(req.body.data);
        let tempData = req.body.data;
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
        let tempData = req.body.data
        let id = req.body.id;
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

let resData = <any>[];
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
                            binary: "/usr/local/bin/kubectl",
                            kubeconfig: `./kubeconfigfiles/${allData[item].clusters[clusterItem].clusterName}.yaml`,
                            version: "/api/v1",
                        });
                        await kubectl.pod.list(function (err, pods) {
                            resData = [];
                            try {
                                let Data = JSON.parse(JSON.stringify(pods));
                                // console.log(Data.items)
                                for (let index = 0; index < Data.items.length; index++) {
                                    // console.log(Data.items[index]);
                                    resData.push({
                                        "APP": Data.items[index].metadata.labels.app,
                                        "PNAME": Data.items[index].metadata.name,
                                        "STATUS": Data.items[index].status.phase,
                                        // "RESTARTS": Data.items[index].status.containerStatuses[indexOne].restartCount,
                                        "NODE": Data.items[index].spec.nodeName,
                                        "AGE": Data.items[index].status.startTime,
                                        // "READY": Data.items[index].status.containerStatuses[indexOne].ready,
                                    });
                                    for (let indexOne = 0; indexOne < Data.items[index].status.containerStatuses.length; indexOne++) {
                                        // resData.push({
                                        //     "APP": Data.items[index].metadata.labels.app,
                                        //     "PNAME": Data.items[index].metadata.name,
                                        //     "STATUS": Data.items[index].status.phase,
                                        //     "RESTARTS": Data.items[index].status.containerStatuses[indexOne].restartCount,
                                        //     "NODE": Data.items[index].spec.nodeName,
                                        //     "AGE": Data.items[index].status.startTime,
                                        //     "READY": Data.items[index].status.containerStatuses[indexOne].ready,
                                        // });
                                        // console.log(resData);
                                    }
                                }
                            } catch (err) {
                                console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 404");
                                resData.push({
                                    "APP": "No Response",
                                    "PNAME": "No Response",
                                    "STATUS": "No Response",
                                    "RESTARTS": "No Response",
                                    "NODE": "No Response",
                                    "AGE": "No Response",
                                    "READY": "No Response",
                                });
                                console.error(err.error);
                                resolve();
                            }
                        });

                        // kubectl.pod.logs('inventory-657978f645-622fn', function(err, log){
                        //     resData = JSON.parse(JSON.stringify(log));
                        //     console.log(resData)
                        // })
                        // kubectl.node.list(function(err, nodes){
                        //     resData = JSON.parse(JSON.stringify(nodes));
                        //     console.log(resData)
                        // })

                    }
                    // console.log(allData[item].clusters[clusterItem]._id);
                    // console.log(allData[item].clusters[clusterItem].kubeConfig);

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
                            binary: "/usr/local/bin/kubectl",
                            kubeconfig: `./kubeconfigfiles/${allData[item].clusters[clusterItem].clusterName}.yaml`,
                            version: "/api/v1",
                        });
                        console.log(groupId, clusterId, podName)
                        try {
                            if (h) {
                                await kubectl.pod.logs(`${podName} --since=${h}`, function(err, log){
                                    resLogs = [];
                                    // resLogs = JSON.parse(JSON.stringify(log));
                                    resLogs = log;
                                })
                            } else {
                                await kubectl.pod.logs(`${podName}`, function(err, log){
                                    resLogs = [];
                                    // resLogs = JSON.parse(JSON.stringify(log));
                                    resLogs = log;
                                })
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
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName + " => Get pods Res: 200");
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
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName + " => Get pods Res: 200");
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
