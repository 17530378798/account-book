# 禾账 Offline Ledger

这是一个纯前端、可离线使用的个人记账 PWA。数据保存在当前浏览器的 `localStorage` 中，每个用户名拥有独立的记录和预算。

## GitHub Pages 部署

1. 将本目录中的文件推送到 GitHub 仓库。
2. 在仓库的 **Settings -> Pages** 中选择 `Deploy from a branch`，分支选择 `main`，目录选择 `/ (root)`。
3. 打开 GitHub Pages 地址即可使用；首次联网打开后，浏览器会缓存页面，之后可离线访问。

## 账户说明

用户名和本地口令只用于区分同一浏览器中的数据，不是服务器账户系统。GitHub Pages 不会同步不同电脑或浏览器的数据，也不适合保存敏感财务资料。需要跨设备同步、真正的登录验证时，应接入后端数据库和认证服务。
