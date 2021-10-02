const tiny = require('tiny-json-http');
const md5 = require('js-md5');

async function getMetaDatabyUrl(url) {
  var json = {};
  try {
    json = (await tiny.get({ url: url })).body
  } catch (err) {
    // json = err.body;
    console.log(err.body)
  }

  logging('getMetaDatabyUrl', 'metadata from url: '+  json)
  return json;
}

function logging(eventName, messages,level) {
  var lv = "INFO"
  if(level){
    lv = level;
  }
  console.log('[' + new Date(Date.now()).toJSON() +'] '+ lv+ ': ' + eventName + ': ' + messages);
  
}




async function exiamineMetaData(metadata) {
  if (!metadata['version']) metadata['version'] = 'v1';
  if (!metadata['articles']) metadata['articles'] = new Array();
  if (!metadata['trash']) metadata['trash'] = new Array();
  if (!metadata['logging']) metadata['logging'] = new Array();

  logging('exiamineMetaData', 'exiamined metadata structure.');
  return JSON.parse(metadata);
}


function unrecordedFileAction(file_name, metadata) {
  logging('UnrecordedFileAction', 'started a unrecordedFileAction');


  logging('UnrecordedFileAction', 'created file name: ' + file_name);
  const uid = md5(file_name);
  if (metadata['articles'][uid]) {
    const revise_time = Number.parseInt(metadata['articles'][uid]['revise_time']);
    if (revise_time > -1) metadata['articles'][uid]['revise_time'] = revise_time + 1;
    else metadata['articles'][uid]['revise_time'] = 1;
  }
  else {
    const pathArray = file_name.split('/');
    const title = pathArray[pathArray.length - 1].split('.')
    const json = ' {"path":"' + file_name + '"' +
      ',"title": "' + title[0] + '"' +
      ',"revise_time": 0 ' +
      ',"authors": [] ' +
      ',"tags": [] ' +
      ',"used_names": [] ' +
      ',"last_action": "unknown"' +
      ',"created_timestamp":' + Date.now() +
      ',"updated_timestamp":' + Date.now() +
      "}";
    logging('UnrecordedFileAction', 'created file json detail: ' + json);

    metadata['articles'][uid] = JSON.parse(json);

    logging('UnrecordedFileAction', 'recorded a created file: ' + file_name);
  }


  return metadata;
}

function createdAction(files_detail, metadata) {
  logging('createdAction', 'started a createdAction');
  logging('createdAction', 'counts of created files: ' + files_detail['status']["added"].length);
  logging('createdAction', 'created files infomation: ' + files_detail['status']["added"]);

  files_detail['status']["added"].forEach(function (value) {
    if (value != '') {
      const pathArray = value.split('/');
      const title = pathArray[pathArray.length - 1].split('.')
      const json = '{"' + md5(value) + '" : {"path":"' + value + '"' +
        ',"title": "' + title[0] + '"' +
        ',"revise_time": 0 ' +
        ',"authors": [] ' +
        ',"tags": [] ' +
        ',"used_names": [] ' +
        ',"last_action": "added"' +
        ',"created_timestamp":' + files_detail['timestamp'] +
        ',"updated_timestamp":' + files_detail['timestamp'] +
        "}}";
      logging('createdAction', 'created file json detail: ' + json);

      metadata['articles'] = JSON.parse(json);

      logging('createdAction', 'recorded a created file: ' + value);
    }
  })

  return { files_detail, metadata };
}

function modifiedAction(files_detail, metadata) {
  logging('modifiedAction', 'started a modifiedAction');
  logging('modifiedAction', 'files_detail["status"]["modified"]: ' + files_detail['status']["modified"]);

  files_detail['status']["modified"].forEach(function (value) {
    logging('modifiedAction', 'recorded a modified file: ' + value);

    if (value != '') {

      const uid = md5(value);

      if (metadata['articles'][uid]) {
        const revise_time = Number.parseInt(metadata['articles'][uid]['revise_time']);
        if (revise_time > -1)
          metadata['articles'][uid]['revise_time'] = revise_time + 1;
        else metadata['articles'][uid]['revise_time'] = 1;
        metadata['articles'][uid]['updated_timestamp'] = Date.now();
        metadata['articles'][uid]['last_action'] = "modified";
        logging('modifiedAction', 'recorded a modified file: ' + value);
      }
      else {
        logging('modifiedAction', 'metdata: '+ JSON.stringify(metadata));

        logging('modifiedAction', 'unknown modified action file: ' + value);
        unrecordedFileAction(value, metadata)
      }
    }
  });
  return { files_detail, metadata };
}

function removedAction(files_detail, metadata) {
  logging('removedAction', 'started a removedAction');

  files_detail['status']["removed"].forEach(function (value) {

    if (value != '') {

      const uid = md5(value);
      if (metadata['articles'][uid]) {
        metadata['articles'][uid]['last_action'] = 'removed';
        metadata['articles'][uid]['updated_timestamp'] = Date.now();
        metadata['trash'][uid] = metadata['articles'][uid];
        delete metadata['articles'][uid];
        logging('removedAction', 'recorded a removed file: ' + value);
      } else {
        logging('removedAction', "doesn't find a file: " + value);
        unrecordedFileAction(value, metadata) 
      }

    }
  });
  return { files_detail, metadata };
}

function renamedAction(files_detail, metadata) {
  logging('renamedAction', 'started a renamedAction');
  logging('renamedAction', 'files_detail["status"]["renamed"] = '+ JSON.stringify(files_detail['status']["renamed"]));

  files_detail['status']["renamed"].forEach(
    function (value) {
      logging('renamedAction', 'renamed file: '+ JSON.stringify(value['file']));
      if (value != '') {
        const uid = md5(value['file'].previous_filename);
        if (metadata['articles'][uid]) {

          const pathArray = value['file'].filename.split('/');
          const title = pathArray[pathArray.length - 1].split('.');
          metadata['articles'][uid]['title'] = title[0];

          const revise_time = Number.parseInt(metadata['articles'][uid]['revise_time']);
          metadata['articles'][uid]['revise_time'] = revise_time + 1;

          if (!metadata['articles'][uid]['used_names']) metadata['articles'][uid]['used_names'] = new Array();
          metadata['articles'][uid]['used_names'].push(value['file'].previous_filename);
          
          metadata['articles'][uid]['updated_timestamp'] = Date.now();

          metadata['articles'][md5(value['file'].filename)] = metadata['articles'][uid];
          delete metadata['articles'][uid];
          logging('renamedAction', 'recorded a rename file frome' + value['file'].previous_filename + 'to' + value['file'].filename);
        }
        else {
          unrecordedFileAction(value['file'].filename, metadata);
        }
      }
    });

    return { files_detail, metadata };
}


exports.generateMetaData = async function (files_detail, url) {

  var storedMetaData = await getMetaDatabyUrl(url)


  var result = await exiamineMetaData(storedMetaData)
    .then(data => createdAction(files_detail, data))
    .then(data => modifiedAction(data.files_detail, data.metadata))
    .then(data => renamedAction(data.files_detail, data.metadata))
    .then(data => removedAction(data.files_detail, data.metadata));


  // Object.keys(files_detail['status']).forEach(function (key) {
  //   console.log('Key : ' + key + ', Value : ' + files_detail['status'][key])
  // })

  logging('generateMetaData', 'result:' + JSON.stringify(result.metadata));

  return result.metadata;
}



// async function main() {
//   console.log('%s', generateMetaData({
//     "timestamp": Date.now(),
//     "status": {
//       "added": ['fsdfds.gile'],
//       "modified": new Array(),
//       "removed": new Array(),
//       "renamed": new Array()
//     }
//   },
//   'https://raw.githubusercontent.com/' + args.owner + '/' + args.repo + '/metadata/metadata.json'
//   ));
// }
// main();