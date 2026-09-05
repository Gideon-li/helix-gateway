# Helix 登录信息（私有，请勿公开仓库）

## 控制台账号

管理员邮箱：`524347725@qq.com`

登录页不再展示任何预制账号或密码。首次使用请在登录页用该邮箱 **创建账号** 并设置自己的密码。之后可随时点 **忘记密码**，重置链接会发到这个邮箱。

登录页也可以用 Google / X。

## Helix API 密钥

在控制台 **控制台 → 新建密钥**。完整密钥形如：

```
sk-hx-********************************
```

只在创建弹窗里出现一次，请立刻复制到你的应用环境变量 `HELIX_API_KEY`。

业务应用调用：

```
Authorization: Bearer sk-hx-...
Base URL（HTTP · IP）: http://<服务器IP>/v1
Base URL（HTTP · 域名）: http://<你的域名>/v1
两者同时有效，应用里填任意一个。
model: qwen3.8-flash
```

## 上游（Qwen）

Qwen Token Plan 的公司密钥请只填在 Helix 控制台「上游」页，**不要提交到 Git**。

- Base URL: `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
- 模型: `qwen3.8-flash`

若密钥失效或换区，在「上游」里点编辑，粘贴新密钥，再点「测试连通」。
