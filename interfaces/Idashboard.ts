import {ICore} from './Icore';

export interface Idashboard extends ICore {
  groupName: string,
  clusters: ICluster[],
}

export interface ICluster {
  clusterName: string;
  envName: string;
  kubeConfig: string;
  _id: string;
}
