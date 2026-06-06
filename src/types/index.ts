export interface Tag {
  Key: string;
  Value: string;
}

export interface SecurityGroupRuleInput {
  IpProtocol: string;
  FromPort?: number;
  ToPort?: number;
  CidrIp?: string;
  GroupId?: string;
  Description?: string;
}

export interface SecurityGroupRuleAnalysis {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  cidr?: string;
  sourceGroupId?: string;
  description?: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK";
  reason?: string;
}

export interface SecurityGroupAnalysis {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
  ingressRules: SecurityGroupRuleAnalysis[];
  egressRules: SecurityGroupRuleAnalysis[];
  tags: Tag[];
}

export interface EC2InstanceAnalysis {
  instanceId: string;
  name: string;
  state: string;
  instanceType: string;
  publicIp?: string;
  privateIp?: string;
  vpcId?: string;
  subnetId?: string;
  keyName?: string;
  launchTime?: string;
  securityGroups: { groupId: string; groupName: string }[];
  tags: Tag[];
  tagCompliance: {
    compliant: boolean;
    missingTags: string[];
  };
}

export interface CreateSecurityGroupParams {
  name: string;
  description: string;
  vpcId: string;
  ingressRules?: SecurityGroupRuleInput[];
  egressRules?: SecurityGroupRuleInput[];
  tags?: Record<string, string>;
  region?: string;
}

export interface CreateEC2InstanceParams {
  name: string;
  amiId: string;
  instanceType: string;
  keyName: string;
  securityGroupIds: string[];
  subnetId: string;
  tags?: Record<string, string>;
  userData?: string;
  clientToken?: string;
  region?: string;
}

export interface CreateEC2ScheduleParams {
  instanceId: string;
  startCron?: string;
  stopCron?: string;
  timezone: string;
  scheduleName: string;
  region?: string;
}
