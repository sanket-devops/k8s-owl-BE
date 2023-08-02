import { Idashboard } from "./interfaces/Idashboard";
// import {EStatus} from './interfaces/enums/EStatus';
import { table, getBorderCharacters } from "table";
import Fastify from "fastify";
import axios from 'axios';
import cors from "@fastify/cors";
import moment from "moment";
import * as http from "http";
import * as https from "https";
import K8s from "k8s";
import fs from "fs";
import timestamp from "time-stamp";
import YAML from 'yaml'

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
// let db = 'mongodb://service-owl:ecivreS8002lwO@192.168.10.108:27017/k8s-api-BE?authSource=admin';
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
        // getAllClusterData();
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
        // getAllClusterData();
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

// Kubernetes API function
async function k8sApi(groupId: string, clusterId: string, path:string, reqType?: any) {
    // https://kubernetes.io/docs/reference/kubernetes-api/
    return new Promise(async (resolve, reject) => {
        let server: string = '';
        let auth: string = '';
        let client: string = '';
        let key: string = '';
        let config: any = '';
        let url: string = ''

        let groupData = JSON.parse(JSON.stringify(await k8sModel.findOne({ _id: groupId })));

        async function decBase64(data: string) {
            let buffer = Buffer.from(data, 'base64');
            const decodedString = buffer.toString('utf-8');
            return decodedString;
        }

        groupData.clusters.forEach(async (cluster: any) => {
            if (cluster._id === clusterId) {
                config = YAML.parse(cluster.kubeConfig)
                config.clusters.forEach(async (cluster: any) => {
                    auth = await decBase64(cluster.cluster['certificate-authority-data']);
                    server = cluster.cluster.server;
                });
                config.users.forEach(async (user: any) => {
                    client = await decBase64(user.user['client-certificate-data']);
                    key = await decBase64(user.user['client-key-data']);
                });
            }
        });

        setTimeout(async () => {
            url = server+path;
            console.log(url);
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false,
                ca: auth,
                cert: client,
                key: key,
            });
            
            try {
                switch (reqType) {
                    case "GET":
                        let getData = await axios.get(url, { httpsAgent });
                        // console.log(getData.data.items);
                        resolve(getData.data);
                        break;
                    case "DELETE":
                        let deleteData = await axios.delete(url, { httpsAgent });
                        // console.log(deleteData);
                        resolve(deleteData.data);
                        break;
                
                    default:
                        let response = await axios.get(url, { httpsAgent });
                        // console.log(response.data.items);
                        resolve(response.data);
                        break;
                }
            } catch (error) {
                console.log(error);
                resolve(error);
            }
        }, 100);
    });
}

// Get all the pods from all namespaces
app.get("/clusters/:groupId/:clusterId/pods", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;

        // k8s-api endpoint
        let pods: string = '/api/v1/pods'
        let resApi = await k8sApi(groupId, clusterId, pods)

        res.send(resApi);
        // console.log(resApi);
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 200");
    } catch (e) {
        res.status(500);
    }
});

// Get pods list from the cluster using perticuler namespace.
app.get("/clusters/:groupId/:clusterId/:namespace/pods", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace

        // k8s-api endpoint
        let pods: string = `/api/v1/namespaces/${namespace}/pods`;
        let resApi = await k8sApi(groupId, clusterId, pods, "GET");

        res.send(resApi);
        // console.log(resApi);
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 200");
    } catch (e) {
        res.status(500);
    }
});

// Get Hourly based Container logs inside the pod. 
app.get("/clusters/:groupId/:clusterId/:namespace/:podName/:appName/:h", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let podName = req.params.podName;
        let appName = req.params.appName;
        let sinceSeconds = req.params.h * 3600;

        // k8s-api endpoint https://localhost:6443/api/v1/namespaces/default/pods/frontend-c54c4c6c6-bxmr8/log?container=${appName}&sinceSeconds=${sinceSeconds}
        let hourBasedLog: string = `/api/v1/namespaces/${namespace}/pods/${podName}/log?container=${appName}&sinceSeconds=${sinceSeconds}`;

        res.send({"data": await k8sApi(groupId, clusterId, hourBasedLog)});
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName, 'appName: ' + appName + ` => Get ${sinceSeconds}Sec Pod Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

// Get Full Container logs inside the pod. 
app.get("/clusters/:groupId/:clusterId/:namespace/:podName/:appName", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let podName = req.params.podName;
        let appName = req.params.appName;

        // k8s-api endpoint https://localhost:6443/api/v1/namespaces/default/pods/frontend-c54c4c6c6-bxmr8/log?container=${appName}
        let hourBasedLog: string = `/api/v1/namespaces/${namespace}/pods/${podName}/log?container=${appName}`;

        res.send({"data": await k8sApi(groupId, clusterId, hourBasedLog)});
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName, 'appName: ' + appName + ` => Get Full Pod Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

// Get Hourly based Deployment logs.
app.get("/clusters/HourlyLog/:groupId/:clusterId/:namespace/:deploymentName/:h", async (req: any, res) => {
    try {
        let HourlyLogs: any = [];
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let deploymentName = req.params.deploymentName;
        let sinceSeconds = req.params.h * 3600;

        let pods: string = `/api/v1/namespaces/${namespace}/pods`;
        let getPodsData: any = await k8sApi(groupId, clusterId, pods);

        function getHourlyLogs(podName: any, containerName: any) {
            return new Promise((resolve, reject) => {
                let hourBasedLog: string = `/api/v1/namespaces/${namespace}/pods/${podName}/log?container=${containerName}&sinceSeconds=${sinceSeconds}`;
                let logs = k8sApi(groupId, clusterId, hourBasedLog)
                HourlyLogs.push(`\n>>>>>>>> Log ${podName} => ${containerName} Start <<<<<<<<\n`);
                resolve(logs);
            });
        }

        async function promiseLoopHourlyLogs() {
            for (let pod = 0; pod < getPodsData.items.length; pod++) {
                if (deploymentName === getPodsData.items[pod].metadata.labels.app) {
                    // console.log(getPodsData.items[pod].metadata.labels.app);
                    for (let container = 0; container < getPodsData.items[pod].spec.containers.length; container++) {
                        // console.log(getPodsData.items[pod].spec.containers[container].name);
                        try {
                            await getHourlyLogs(getPodsData.items[pod].metadata.name, getPodsData.items[pod].spec.containers[container].name).then((logs: any) => {
                                HourlyLogs.push(logs);
                                HourlyLogs.push(`\n>>>>>>>> Log ${getPodsData.items[pod].metadata.name} => ${getPodsData.items[pod].spec.containers[container].name} End <<<<<<<<\n`);
                            })
                        } catch (error) {
                            console.log(error);
                        }
                    }
                }
            }
            // console.log(HourlyLogs);
            return HourlyLogs;
        }

        res.send({"data": await promiseLoopHourlyLogs()});
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'Deployment Name: ' + deploymentName + ` => Get ${sinceSeconds}Sec Pod Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

// Get Full Deployment logs.
app.get("/clusters/HourlyLog/:groupId/:clusterId/:namespace/:deploymentName", async (req: any, res) => {
    try {
        let HourlyLogs: any = [];
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let deploymentName = req.params.deploymentName;

        let pods: string = `/api/v1/namespaces/${namespace}/pods`;
        let getPodsData: any = await k8sApi(groupId, clusterId, pods);

        function getFullLogs(podName: any, containerName: any) {
            return new Promise((resolve, reject) => {
                let hourBasedLog: string = `/api/v1/namespaces/${namespace}/pods/${podName}/log?container=${containerName}`;
                let logs = k8sApi(groupId, clusterId, hourBasedLog)
                HourlyLogs.push(`\n>>>>>>>> Log ${podName} => ${containerName} Start <<<<<<<<\n`);
                resolve(logs);
            });
        }

        async function promiseLoopFullLogs() {
            for (let pod = 0; pod < getPodsData.items.length; pod++) {
                if (deploymentName === getPodsData.items[pod].metadata.labels.app) {
                    // console.log(getPodsData.items[pod].metadata.labels.app);
                    for (let container = 0; container < getPodsData.items[pod].spec.containers.length; container++) {
                        // console.log(getPodsData.items[pod].spec.containers[container].name);
                        try {
                            await getFullLogs(getPodsData.items[pod].metadata.name, getPodsData.items[pod].spec.containers[container].name).then((logs: any) => {
                                HourlyLogs.push(logs);
                                HourlyLogs.push(`\n>>>>>>>> Log ${getPodsData.items[pod].metadata.name} => ${getPodsData.items[pod].spec.containers[container].name} End <<<<<<<<\n`);
                            })
                        } catch (error) {
                            console.log(error);
                        }
                    }
                }
                
            }
            // console.log(HourlyLogs);
            return HourlyLogs;
        }

        res.send({"data": await promiseLoopFullLogs()});
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'Deployment Name: ' + deploymentName + ` => Get Full Deployment Logs Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

// Delete pod.
app.delete("/clusters/DeletePod/:groupId/:clusterId/:namespace/:podName", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let podName = req.params.podName;

        // k8s-api endpoint /api/v1/namespaces/{namespace}/pods/{name}
        let deletePod: string = `/api/v1/namespaces/${namespace}/pods/${podName}`;

        res.send(await k8sApi(groupId, clusterId, deletePod, "DELETE"));
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 200");
    } catch (e) {
        res.status(500);
    }
});

module.exports = app;
