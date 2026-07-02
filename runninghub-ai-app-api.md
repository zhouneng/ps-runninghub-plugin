# RunningHub AI App API Notes

## App

- Name: 8K高清修复放大
- Webapp ID: `2069244113970614273`
- Type: 图生图 / Image-to-Image
- Instance type shown on page: `plus`

## Input Node

This app has one image input node.

```json
{
  "nodeId": "914",
  "nodeName": "LoadImage",
  "fieldName": "image",
  "fieldType": "IMAGE",
  "description": "上传图像",
  "descriptionEn": "Upload image"
}
```

After uploading an image, pass the upload response `data.fileName` into this node's `fieldValue`.

## Upload Image

Endpoint:

```text
POST https://www.runninghub.cn/openapi/v2/media/upload/binary
Authorization: Bearer <RUNNINGHUB_API_KEY>
Content-Type: multipart/form-data
```

Form field:

```text
file=<binary image file>
```

Useful response field:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "type": "image",
    "download_url": "...",
    "fileName": "openapi/....png",
    "size": "3490"
  }
}
```

Use `data.fileName` for the AI app input node.

## Run AI App Task

Endpoint:

```text
POST https://www.runninghub.cn/task/openapi/ai-app/run
Authorization: Bearer <RUNNINGHUB_API_KEY>
Content-Type: application/json
```

Request body for this app:

```json
{
  "apiKey": "<RUNNINGHUB_API_KEY>",
  "webappId": 2069244113970614273,
  "instanceType": "plus",
  "nodeInfoList": [
    {
      "nodeId": "914",
      "nodeName": "LoadImage",
      "fieldName": "image",
      "fieldValue": "<UPLOAD_RESPONSE_DATA_FILENAME>"
    }
  ]
}
```

Useful response fields:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "taskId": "1907035719658053634",
    "clientId": "...",
    "taskStatus": "RUNNING",
    "netWssUrl": "..."
  }
}
```

## Query Task Result

Prefer the V2 query endpoint.

```text
POST https://www.runninghub.cn/openapi/v2/query
Authorization: Bearer <RUNNINGHUB_API_KEY>
Content-Type: application/json
```

Request body:

```json
{
  "taskId": "<TASK_ID>"
}
```

Success response:

```json
{
  "taskId": "...",
  "status": "SUCCESS",
  "errorCode": "",
  "errorMessage": "",
  "results": [
    {
      "url": "https://...",
      "outputType": "jpg"
    }
  ],
  "clientId": "",
  "promptTips": ""
}
```

Runtime states to handle:

- `RUNNING`
- `QUEUED`
- `SUCCESS`
- `FAILED`

## Website API Button

The RunningHub detail page uses this website-only endpoint to generate a copied API call example:

```text
POST https://www.runninghub.cn/api/webapp/generateApiCallUrl
```

It requires a logged-in RunningHub web session. API Key authentication alone returns `USER_DOES_NOT_EXIST`, so the plugin should not depend on this endpoint.
