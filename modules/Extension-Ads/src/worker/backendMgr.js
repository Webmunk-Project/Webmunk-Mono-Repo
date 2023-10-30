const GOOGLE_API_KEY='AIzaSyB7E3vnhTD3v1LJX51XpJh9AOWtWyTiZiw';
const GDRIVE_URL='https://content.googleapis.com/drive/v3';
const APP_NAME = "webLink";
const FIELD_FOR_PROPERTIES = "properties";

const backendMgr = {
    _weblinkFolderId:null,
    _token:null,
    headerAutorization: {},
    initialize:async function(){
      self.messenger.addReceiver('backendMgr', this);
      let local = await chrome.storage.local.get(null);
      if (local["options-destination"]==0) this.grantAccessToGdrive();
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "googleAuthAlarm") {
          this.grantAccessToGdrive();
        }
      });
    },
    revokeAccessToGdrive:function(){
      chrome.alarms.clear("googleAuthAlarm")
    },
    grantAccessToGdrive:function(){
      return new Promise((resolve,reject) => {
        chrome.identity.getAuthToken({interactive:true},(token)=>{
          console.log("chrome.identity.getAuthToken: "+token)
          this.setAccessToken(token);
          this.createWeblinkFolderIfRequired();
          resolve();
        })
        chrome.alarms.getAll((alarms) => {
          let alarmCreated = alarms.includes("googleAuthAlarm");
          !alarmCreated && chrome.alarms.create("googleAuthAlarm", { periodInMinutes: 60 });
        });
      })
    },
    getToken:function(){
      return this._token;
    },
    setAccessToken: function(token1){
      this.headerAutorization = {Authorization: 'Bearer ' + token1};
      this._token = token1
    },
    createWeblinkFolderIfRequired:async function(){
      this._weblinkFolderId = await this.weblinkExist();
      if (!this._weblinkFolderId) {
        this._weblinkFolderId = await this.createWeblinkFolder()
      }
    },
    createWeblinkFolder:function(){
      return fetch(GDRIVE_URL+'/files?alt=json&'+
        `key=${GOOGLE_API_KEY}`,
        {
        method:"POST",
        headers:{'content-type': 'application/json', ...this.headerAutorization},
        body: JSON.stringify({kind: "drive#file",
                                mimeType: "application/vnd.google-apps.folder",
                                name: APP_NAME})
        }
      )
      .then((response) => response.json())
      .then(function(data) {
        console.log(data)
        return data?.id;
      });
    },
    weblinkExist:function(){
      let url = GDRIVE_URL+`/files?q=trashed%3Dfalse%20and%20parents%3D%22root%22%20and%20name%3D%22${APP_NAME}%22&key=`+GOOGLE_API_KEY;
      return fetch(url,
        {headers:{'content-type': 'application/json', ...this.headerAutorization}}
      )
      .then((response) => response.json())
      .then((data) => {
        console.log(data)
        if (data.files.length){
          return data.files[0].id;
        }
        return null;
      });
    },
    getFileIdForUrl:function(u){
      //TODO: pagination for scaling beyond 1000 archived pages
      let url = GDRIVE_URL+`/files?q=trashed%3Dfalse%20and%20parents%3D%22${this._weblinkFolderId}%22&fields=files(${FIELD_FOR_PROPERTIES}%2Cid)&pageSize=1000&key=`+GOOGLE_API_KEY;
      return fetch(url,
        {headers:{'content-type': 'application/json', ...this.headerAutorization}}
      )
      .then((response) => response.json())
      .then((data) => {
        console.log(data)
        let file =  data.files.find(file => (file[FIELD_FOR_PROPERTIES] && this.getAppProperties(file[FIELD_FOR_PROPERTIES],"url") == u));
        return file?.id;
      });
    },
    _onMessage_loadArchives:function(data) {
      return this.loadArchives(data.nextPageToken);
    },
    loadArchives:async function(nextPageToken){
      if (!this._token) await this.grantAccessToGdrive();
      let url = GDRIVE_URL+`/files?q=trashed%3Dfalse%20and%20parents%3D%22${this._weblinkFolderId}%22&fields=nextPageToken%2Cfiles(name%2CthumbnailLink%2Cid%2CmodifiedTime%2C${FIELD_FOR_PROPERTIES})&pageSize=2&key=`+GOOGLE_API_KEY;
      if (nextPageToken) url += `&pageToken=${nextPageToken}`;
      return fetch(url,
        {headers:{'content-type': 'application/json', ...this.headerAutorization}}
      )
      .then((response) => response.json())
      .then((data) => {
        return data;
      });
    },
    createPageOnGoogleDrive(filename, url){
      return this.savePageToGoogleDrive(filename,url,"");
    },
    savePageToGoogleDrive(filename,url, buffer){
      var file = new Blob([buffer], {type: "text/html"});
      var metadata = {
        "name": filename,
        "mimeType": "text/html",
        "parents": [this._weblinkFolderId], // Google Drive folder id
        "description": "created by Weblink"
      };
      var form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);
      return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + this._token }),
        body: form,
      }).then((res) => {
        return res.json();
      }).then((result) => {
        console.log("savePageToGoogleDrive: value returned:"+result.id);
        return result.id;
      });
    },
    getAppProperties:function(appProperties,originalKey) {
      let i = 0;
      let value = "";
      while (true) {
        const chunk = appProperties[originalKey + "_" + i];
        if (chunk == null) break;
        value += chunk;
        i++;
      }
      return value;
    },
    setAppProperties:function(appProperties,originalKey, originalValue) {
      function splitIntoChunks(originalValue, chunkSize) {
        const chunks = [];
        for (let i = 0; i < originalValue.length; i += chunkSize) {
          chunks.push(originalValue.slice(i, i + chunkSize));
        }
        return chunks;
      }
      const chunkSize = 124-originalKey.length-3;
      const chunks = splitIntoChunks(originalValue, chunkSize);
      for (let i = 0; i < chunks.length; i++) {
        appProperties[originalKey + "_" + i] = chunks[i];
      }
    },
    updatePageOnGoogleDrive:function(fileId, {buffer=null, thumbnailDataURL=null,tags=[], originalUrl} ){
      let file = buffer ? new Blob([buffer], {type: "text/html"}) : null;
      let appProperties = {};
      originalUrl && this.setAppProperties(appProperties,"url",originalUrl);
      tags.forEach((tag, i) => {
        appProperties["tag"+i]=tag;
      });
      //thumbnailDataURL && (appProperties["thumbnail"] = thumbnailDataURL);
      let thumbnail = thumbnailDataURL ? {
        image: thumbnailDataURL,
        mimeType: 'image/jpeg'
      } : undefined;
      
      let metadata = {
        [FIELD_FOR_PROPERTIES]: ((tags.length!=0 || appProperties["url_0"]) ?  appProperties:undefined ),
        contentHints:{thumbnail:thumbnail}
      };
      var form = new FormData();
      let headers;
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      if (file) form.append('file', file);
      let url = `https://content.googleapis.com/drive/v3/files/${fileId}?alt=json&key=${GOOGLE_API_KEY}`;
      if (buffer) {
        headers = new Headers({ 'Authorization': 'Bearer ' + this._token })
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&supportsAllDrives=true`;
      }
      else{
        headers = new Headers({ 
          'Authorization': 'Bearer ' + this._token, 
          'Content-Type': 'application/json'
        })
      }
      return fetch(url, {
        method: 'PATCH',
        headers,
        body: buffer ? form : JSON.stringify(metadata),
      }).then((res) => {
        return res.json();
      }).then((result) => {
        console.log("updatePageOnGoogleDrive: value returned:"+result.id);
        return result.id;
      });
    },
    changePermissions:function(fileId,{role,type}){
      var form = new FormData();
      form.append('role',role);
      form.append('type',type);
      let url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=id`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({role,type})
      })
    },
    getTags:function(title,sitename){
      var form = new FormData();
      form.append('sitename', sitename);
      form.append('title', title);
      return fetch(`https://tvsurftv.com/WEBLINK/classify.php`, {
        method: 'POST',
        body: form,
      }).then((res) => {
      if (!res.ok) {
        throw new Error(res.status);
      }
        return res.json();
      }).then((result) => {
        console.log("getTags: value returned:"+result);
        if (sitename) result.tagsArray.push(sitename)
        return result;
      });
    },
    _onMessage_deleteFile:function(data) {
      return this.deleteFile(data.fileId);
    },
    deleteFile:function(fileId){
      var url = `https://www.googleapis.com/drive/v3/files/${fileId}`
      return fetch(url, {
        headers: {
          'Authorization': `Bearer ${this._token}`
        },
        method: "DELETE"
      });
    },
    uploadEphemeral:function(filename,buffer ){
    var file = new Blob([buffer], {type: "text/html"});
    var metadata = {
        //"name": filename,
        "mimeType": "text/html",
        //"parents": [this._weblinkFolderId], // Google Drive folder id
        //"description":`created by ${APP_NAME}`
    };
    var form = new FormData();
    form.append('filename', filename);
    form.append('file', file);
    return fetch(`https://tvsurftv.com/WEBLINK/upload.php`, {
      method: 'POST',
      //headers: new Headers({ 'Authorization': 'Bearer ' + this._token }),
      body: form,
    }).then((res) => {
      if (!res.ok) {
        throw new Error(res.status);
      }
      return res.json();
    }).then((result) => {
      console.log("fileId: value returned:"+result.id);
      return result.id;
    });
  },
};
backendMgr.initialize();
export default backendMgr;