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
const {Readable} = require('stream') 
import WebSocket, { CLOSING, WebSocketServer } from "ws";
import { string } from "yaml/dist/schema/common/string";

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
const WebSocketPort = 8009;
let k8sModel = require("./k8s.model");
let db = 'mongodb://service-owl:ecivreS8002lwO@192.168.120.135:27017/k8s-owl?authSource=admin';
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

const wss = new WebSocketServer({ port: WebSocketPort }, function () {
    console.log(`k8s-owl-BE-Wss listen at : http://${hostname}:${WebSocketPort}`);
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

async function getClusterAccess(groupId: string, clusterId: string) {
    return new Promise(async(resolve, reject) => {
        let groupData = JSON.parse(
            JSON.stringify(await k8sModel.findOne({ _id: groupId }))
        );
        async function decBase64(data: string) {
            let buffer = Buffer.from(data, "base64");
            const decodedString = buffer.toString("utf-8");
            return decodedString;
        }
        groupData.clusters.forEach(async (cluster: any) => {
            if (cluster._id === clusterId) {
                let server: string, auth: string, client: string, key: string;
                let config = YAML.parse(cluster.kubeConfig);
                config.clusters.forEach(async (cluster: any) => {
                    auth = await decBase64(cluster.cluster["certificate-authority-data"]);
                    server = cluster.cluster.server;
                });
                config.users.forEach(async (user: any) => {
                    client = await decBase64(user.user["client-certificate-data"]);
                    key = await decBase64(user.user["client-key-data"]);
                });
                setTimeout(async() => {
                    // console.log(server);
                    resolve({server: server, auth: auth, client: client, key: key})
                }, 1);
            }
        });
    })

    
}

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
            // console.log(url);
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

// Get all the namespaces
app.get("/clusters/namespaces/:groupId/:clusterId", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;

        // k8s-api endpoint
        let namespaces: string = '/api/v1/namespaces'
        let resApi = await k8sApi(groupId, clusterId, namespaces, 'GET')

        res.send(resApi);
        // console.log(resApi);
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get namespaces Res: 200");
    } catch (e) {
        res.status(500);
    }
});


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
        // console.log(resApi);

        res.send(resApi);
        // console.log(resApi);
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 200");
    } catch (e) {
        res.status(500);
    }
});

// Get services from the specific namespace.
app.get("/clusters/:groupId/:clusterId/:namespace/services", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace
        // k8s-api endpoint
        let services: string = `/api/v1/namespaces/${namespace}/services`;
        let resApi = await k8sApi(groupId, clusterId, services, "GET");
        res.send(resApi);
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get services Res: 200");
    } catch (e) {
        res.status(500);
    }
});

app.get("/clusters/:groupId/:clusterId/nodesMetricsMix", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let finalNodesData: any[] = [];
        let tempData: any[] = [];
        // k8s-api endpoint
        let nodes: string = `/api/v1/nodes`;
        let getNodes: any = await k8sApi(groupId, clusterId, nodes, "GET");
        let nodesMetrics: string = `/apis/metrics.k8s.io/v1beta1/nodes`;
        let getNodesMetrics: any = await k8sApi(groupId, clusterId, nodesMetrics, "GET");
        if (getNodes.items && getNodesMetrics.items) {
            for (let i = 0; i < getNodes.items.length; i++) {
                for (let j = 0; j < getNodesMetrics.items.length; j++) {
                    if (getNodes.items[i].metadata.name === getNodesMetrics.items[j].metadata.name) {
                        getNodes.items[i].status.usage = getNodesMetrics.items[j].usage;
                    }
                }
            }
        }
        else {
            for (let i = 0; i < getNodes.items.length; i++) {
                getNodes.items[i].status.usage = {
                    "cpu": "No Data",
                    "memory": "No Data"
                };
            }
        }
        res.send(getNodes);
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get nodes Res: 200");
    } catch (e) {
        res.status(500);
    }
});
app.get("/clusters/:groupId/:clusterId/:namespace/podsMetricsMix", async (req: any, res: any) => {
    let groupId = req.params.groupId;
    let clusterId = req.params.clusterId;
    let namespace = req.params.namespace
    // k8s-api endpoint
    let pods: string = `/api/v1/namespaces/${namespace}/pods`;
    let getPods: any = await k8sApi(groupId, clusterId, pods, "GET");
    // console.log(getPods);
    let podsMetrics: string = `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`;
    let getPodsMetrics: any = await k8sApi(groupId, clusterId, podsMetrics, "GET");

    // let nodesMetrics: string = `/apis/metrics.k8s.io/v1beta1/nodes`;
    // let getNodesMetrics: any = await k8sApi(groupId, clusterId, nodesMetrics, "GET");

    let nodes: string = `/api/v1/nodes`;
    let getNodes: any = await k8sApi(groupId, clusterId, nodes, "GET");

    console.log(getNodes.items[0].status.capacity);

    if (getPods.items && getPodsMetrics.items) {
        for (let i = 0; i < getPods.items.length; i++) {
            for (let j = 0; j < getPodsMetrics.items.length; j++) {
                if (getPods.items[i].metadata.name === getPodsMetrics.items[j].metadata.name) {
                    getPods.items[i].spec.containers.forEach((c: any) => {
                        getPodsMetrics.items[j].containers.forEach((cm: any) => {
                            if (c.name === cm.name) {
                                c.usage = cm.usage;
                                console.log(cm);
                            }
                        });
                    });
                }
            }
        }
    } else {
        for (let i = 0; i < getPods.items.length; i++) {
            getPods.items[i].spec.containers.forEach((c: any) => {
                c.usage = {
                    "cpu": "No Data",
                    "memory": "No Data"
                };
            });
        }
    }
    res.send(getPods);
    console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId + " => Get pods Res: 200");
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

app.get("/clusters/previous/:groupId/:clusterId/:namespace/:podName/:appName", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let podName = req.params.podName;
        let appName = req.params.appName;

        // k8s-api endpoint https://localhost:6443/api/v1/namespaces/default/pods/frontend-c54c4c6c6-bxmr8/log?container=${appName}&previous=true
        let hourBasedLog: string = `/api/v1/namespaces/${namespace}/pods/${podName}/log?container=${appName}&previous=true`;

        res.send({"data": await k8sApi(groupId, clusterId, hourBasedLog)});
        console.log('GroupId: ' + groupId, 'ClusterId: ' + clusterId, 'podName: ' + podName, 'appName: ' + appName + ` => Get Full Previous Pod Logs Res: 200`);
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
        console.log(`GroupId:  ${groupId} ClusterId: ${clusterId} => Pod: "${podName}" is deleted Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

// Get follow logs from cluster
app.get("/clusters/follow/:groupId/:clusterId/:namespace/:podName/:appName/:tailLines", async (req: any, res) => {
    return new Promise<void>(async (resolve, reject) => {
        getClusterAccess(req.params.groupId, req.params.clusterId).then((data: any) => {
            let namespace = req.params.namespace,
                podName = req.params.podName,
                appName = req.params.appName,
                tailLines = req.params.tailLines;

            // k8s-api endpoint https://localhost:6443/api/v1/namespaces/default/pods/frontend-c54c4c6c6-bxmr8/log?container=${appName}&sinceSeconds=${sinceSeconds}
            let path: string = `/api/v1/namespaces/${namespace}/pods/${podName}/log?container=${appName}&tailLines=${tailLines}&follow=true`;

            let url = data.server + path;
            // console.log(url);
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false,
                ca: data.auth,
                cert: data.client,
                key: data.key
            });
            const options = {
                method: "GET",
                agent: httpsAgent,
            };

            try {
                let request = https.request(url, options, (response) => {
                    if (response.statusCode === 200) {
                        res.send({ "id": `${podName}-${appName}` });
                        resolve();
                    }
                    else {
                        res.status(401);
                        resolve();
                    }

                    wss.on('connection', (ws, req) => {
                        // Handles new connection
                        let clientIp = req.socket.remoteAddress;
                        let path = req.url;
                        if (path === `/${podName}-${appName}`) {
                            console.log(`WS Client ${clientIp} and Path ${path} is Connected...`)
                            console.log(path);
                            response.on("data", (chunk) => {
                                ws.send(chunk.toString());
                                console.log(chunk);
                            });
                        }
                        ws.on('error', console.error);
                        ws.on('close', function close() {
                            console.log(`CONNECTION CLOSE: => WS Client ${clientIp} and Path ${path} is Disconnected...`);
                        });
                        if (path === `/${podName}-${appName}/stop`) {
                            setTimeout(() => {
                                console.log(path);
                                request.abort();
                                ws.close(1000, `WS Client ${clientIp} and Path ${path} is Disconnected...`);
                                // ws.terminate();
                                console.log(`WS Client ${clientIp} and Path ${path} is Disconnected...`);
                            }, 100);
                        }

                        setTimeout(() => {
                            request.abort();
                            ws.close();
                            // ws.terminate();
                            console.log(`TIME OUT: => WS Client ${clientIp} and Path ${path} is Disconnected...`);
                        }, 60000 * 5);
                    })
                    response.on("end", () => {
                        console.log("Log streaming ended.");
                    });
                });

                // Event listener for handling errors
                request.on("error", (err) => {
                    console.error("Error occurred:", err);
                    // res.send(err);
                });

                // Send the request
                request.end();
            } catch (error) {
                res.code(500).send('Error Streaming Data.')
            }
            console.log(
                "GroupId: " + req.params.groupId,
                "ClusterId: " + req.params.clusterId,
                "podName: " + podName,
                "appName: " + appName + ` => Get ${tailLines} lines and follow Pod Logs Res: 200`
            );
        });
    });
});


// Get deployment manifest from the cluster using perticuler namespace then rollout and restart.
app.get("/clusters/restart/:groupId/:clusterId/:namespace/:name", async (req: any, res) => {
    return new Promise<void>(async (resolve, reject) => {
        let namespace = req.params.namespace;
        let name = req.params.name
        getClusterAccess(req.params.groupId, req.params.clusterId).then(async (data: any) => {
            // k8s-api endpoint
            let path: string = `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`;

            let url = data.server + path;
            console.log(url);
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false,
                ca: data.auth,
                cert: data.client,
                key: data.key
            });
            const options = {
                method: "GET",
                agent: httpsAgent,
            };
            let resApi: any = await axios.get(url, { httpsAgent });
            let deploymentManifest = resApi.data;
            if (deploymentManifest.spec.template.metadata.labels.restart) {
                deploymentManifest.spec.template.metadata.labels.restart = (parseInt(deploymentManifest.spec.template.metadata.labels.restart) + 1).toString();
            }
            else {
                deploymentManifest.spec.template.metadata.labels.restart = "1";
            }
            let rolloutRestart = await axios.put(url, deploymentManifest, { httpsAgent });
            resolve(rolloutRestart.data);
        });
    });
});

// Get deployment manifest from the cluster using perticuler namespace then patch.
app.get("/clusters/manifest/:groupId/:clusterId/:namespace/:name", async (req: any, res) => {
    return new Promise<void>(async (resolve, reject) => {
        let namespace = req.params.namespace;
        let name = req.params.name
        getClusterAccess(req.params.groupId, req.params.clusterId).then(async (data: any) => {
            // k8s-api endpoint
            let path: string = `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`;

            let url = data.server + path;
            console.log(url);
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false,
                ca: data.auth,
                cert: data.client,
                key: data.key
            });
            const options = {
                method: "GET",
                agent: httpsAgent,
            };
            let resApi: any = await axios.get(url, { httpsAgent });
            let deploymentManifest = resApi.data;
            resolve(deploymentManifest);
        });
    });
});

// Patch deployment manifest and then rollout restart update deployment.
app.post("/clusters/cluster/deployment/update-deployment", async (req: any, res) => {
    let reqData = req.body;
    // console.log(req.body);
    return new Promise(async (resolve, reject) => {
        let namespace = reqData.namespace;
        let name = reqData.deploymentName
        getClusterAccess(reqData.groupId, reqData.clusterId).then(async (data: any) => {
            // k8s-api endpoint
            let path: string = `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`;

            let url = data.server + path;
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false,
                ca: data.auth,
                cert: data.client,
                key: data.key
            });
            const config = {
                httpsAgent: httpsAgent,
                headers: {
                    'Content-Type': 'application/strategic-merge-patch+json'
                },
            }
            try {
                let updateDeployment = await axios.patch(url, reqData.data, config);
                resolve(updateDeployment.data);
            } catch (error) {
                console.log(error);
                res.status(400);
                resolve(error.response)
            }
        });
    });
});

// Delete Deployment.
app.delete("/clusters/DeleteDeployment/:groupId/:clusterId/:namespace/:deploymentName", async (req: any, res) => {
    try {
        let groupId = req.params.groupId;
        let clusterId = req.params.clusterId;
        let namespace = req.params.namespace;
        let name = req.params.deploymentName;

        // k8s-api endpoint /apis/apps/v1/namespaces/${namespace}/deployments/${name}
        let deleteDeployment: string = `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`;

        res.send(await k8sApi(groupId, clusterId, deleteDeployment, "DELETE"));
        console.log(`GroupId:  ${groupId} ClusterId: ${clusterId} => Deployment: "${name}" is deleted Res: 200`);
    } catch (e) {
        res.status(500);
    }
});

module.exports = app;
