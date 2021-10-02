const tiny = require('tiny-json-http');
const { v5: uuidv5 } = require('uuid');

const args = { owner: "keyskull", repo: "publish" };


async function getMetaDatabyUrl(url) {
  var json = {};
  try {
    json = (await tiny.get({ url: url })).body
  } catch (err) {
    // json = err.body;
    console.log(err.body)
  }
  return json;
}

function logging(eventName, messages) {
  console.log('['+Date.now().toDateString() +'] '+ eventName+ ': ' + messages)
  
}




async function exiamineMetaData(metadata) {
  if (!metadata['version']) metadata['version'] = 'v1';
  if (!metadata['articles']) metadata['articles'] = new Array();
  if (!metadata['trash']) metadata['trash'] = new Array();
  if (!metadata['logging']) metadata['logging'] = new Array();

  logging('exiamineMetaData','exiamined metadata structure.');
  return metadata;
}

function createdAction(files_detail, metadata) {
  files_detail['status']["added"].forEach(
    function (value) {
      metadata['articles'] = JSON.parse("{" + uuidv5(value, uuidv5.URL) + ": {'path':" + value +
        ",'title': " + value +
        ",'revise_time': 0 " +
        ",'authors': [] " +
        ",'tags': [] " +
        ",'used_names': [] " +
        ",'last_action': added" +
        ",'created_timestamp':" + files_detail['timestamp'] +
        ",'updated_timestamp': " + files_detail['timestamp'] +
        "}}");

        logging('createdAction','recorded a created file: '+ value);
    })

  return { files_detail, metadata };
}

function modifiedAction(files_detail, metadata) {
  files_detail['status']["modified"].forEach(
    function (value) {
      var uuid = uuidv5(value, uuidv5.URL);
      if (!metadata['articles'][uuid])
        createdAction();
      else {
        revise_time = Number.parseInt(metadata['articles'][uuid]['revise_time']);
        if (revise_time)
          metadata['articles'][uuid]['revise_time'] = revise_time + 1;
        else metadata['articles'][uuid]['revise_time'] = 1;
        metadata['articles'][uuid]['updated_timestamp'] = Date.now();
        metadata['articles'][uuid]['last_action'] = 'modified'
      }
    
      logging('modifiedAction','recorded a modified file: '+ value);
    });
  return { files_detail, metadata };
}

function removedAction(files_detail, metadata) {
  files_detail['status']["removed"].forEach(
    function (value) {
      const uuid = uuidv5(value, uuidv5.URL);
      if (metadata['articles'][uuid]) {
        metadata['articles'][uuid]['last_action'] = 'removed';
        metadata['articles'][uuid]['updated_timestamp'] = Date.now();
        metadata['trash'] = metadata['articles'][uuid];
        delete metadata['articles'][uuid];

        logging('removedAction','recorded a removed file: '+ value);

      } else {
        logging('removedAction',"doesn't find a file: "+ value);
      }
    });
  return { files_detail, metadata };
}

function renamedAction(files_detail, metadata) {

  files_detail['status']["renamed"].forEach(
    function (value) {
      const uuid = uuidv5(value.previous_filename, uuidv5.URL);
      if (!metadata['articles'][uuid]) createdAction();
      else {
        const revise_time = Number.parseInt(metadata['articles'][uuid]['revise_time']);

        metadata['articles'][uuid]['revise_time'] = revise_time + 1;
        if (!metadata['articles'][uuid]['used_names']) metadata['articles'][uuid]['used_names'] = new Array();
        metadata['articles'][uuid]['used_names'].push(value.previous_filename);
        metadata['articles'][uuid]['updated_timestamp'] = Date.now();

        metadata['articles'][uuidv5(value.filename, uuidv5.URL)] = metadata['articles'][uuid];
        delete metadata['articles'][uuid];
      }

      logging('renamedAction','recorded a rename file frome'+ value.previous_filename +'to'+ value.filename);

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


  Object.keys(files_detail['status']).forEach(function (key) {
    console.log('Key : ' + key + ', Value : ' + files_detail['status'][key])
  })

  return result;
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