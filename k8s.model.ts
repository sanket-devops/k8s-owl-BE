import mongoose from 'mongoose';
// const bcrypt = require("bcrypt");
const { Schema } = mongoose;

const k8sSchema = new Schema({
    groupName: String,
    clusters: [{clusterName: String, envName: String, kubeConfig: String}],
}, {
    // http://mongoosejs.com/docs/guide.html#timestamps
    timestamps: true
});
module.exports = mongoose.model('k8s-clusters', k8sSchema);
