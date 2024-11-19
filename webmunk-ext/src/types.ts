export type AdPersonalizationItem = {
  key: string;
  name: string;
  url: string;
}

export type PersonalizationConfigItem = {
  key: string
  value: boolean;
}

export type SurveyItem = {
  name: string;
  url: string;
};

export type User = {
  sessionUid: string;
  prolificId: string;
  uid: string;
  active: boolean;
}