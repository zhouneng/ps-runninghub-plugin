# RunningHub Web

这是 RunningHub AI 应用的网页版本。

## 功能

- 保存 RunningHub API Key 到浏览器本地
- 粘贴 RunningHub AI 应用 URL 或 AppID
- 读取应用参数并动态生成表单
- 支持文本、下拉选项、图片上传参数
- 上传本地图片到 RunningHub
- 提交 AI 应用任务
- 自动轮询和手动查询任务结果
- 预览、下载、复制、打开结果图片
- 保存最近任务历史

## 使用方式

在这个目录启动一个本地静态服务器：

```text
C:\Users\Ekko\Documents\AI生图软件开发\ps-runninghub-plugin
```

然后在浏览器打开：

```text
http://localhost:8765
```

## 基本流程

1. 填写 RunningHub API Key。
2. 粘贴 RunningHub 应用 URL 或 AppID。
3. 点击 `获取应用参数`。
4. 根据应用参数填写提示词、选择图片或选择下拉选项。
5. 点击 `上传并生成`。
6. 等待任务完成。
7. 在结果区预览、下载或复制链接。

## 注意

网站版不会连接 Photoshop，也不会导入图层。
原来的 Photoshop 导入能力已经改为浏览器下载结果图片。
