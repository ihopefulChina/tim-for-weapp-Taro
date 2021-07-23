---
title: '封装腾讯即时通讯 for 小程序'
date: 2021-07-22 14:15:47
tags: [JavaScript,微信小程序]
published: true
hideInList: false
feature: /post-images/IZbWBmM7v.png
isTop: false
---
适用小程序(Taro)接入腾讯即时通讯。

<!-- more -->

### 参考资料
1. [SDK API（Web & 小程序）](https://cloud.tencent.com/document/product/269/37411)
2. [微信小程序原生接入腾讯云im](https://blog.csdn.net/weixin_42311676/article/details/105866973?utm_medium=distribute.pc_relevant_t0.none-task-blog-BlogCommendFromMachineLearnPai2-1.add_param_isCf&depth_1-utm_source=distribute.pc_relevant_t0.none-task-blog-BlogCommendFromMachineLearnPai2-1.add_param_isCf)
3. [原生JS集成腾讯IM实时聊天/实时音视频](https://blog.csdn.net/weixin_44622984/article/details/109626266)
4. [微信小程序利用腾讯云IM即时通讯发送文字+表情开发）](https://blog.csdn.net/qq_29789057/article/details/89396550?utm_medium=distribute.pc_relevant.none-task-blog-baidujs_title-1&spm=1001.2101.3001.4242)


```
import Taro from "@tarojs/taro";
import TIM from 'tim-wx-sdk';
import COS from "cos-wx-sdk-v5"
import TIMUploadPlugin from 'tim-upload-plugin';
import roomStore from "~/store/room";
import timStore from '~/store/tim'
//sdk
import { timSDK } from "~/config"

import { get } from "~/components/request";

const userInfo = (Taro.getStorageSync('userInfo')) as any;
// 初始化
const iminit_TIM = async () => {
  const options = {
    SDKAppID: timSDK // 接入时需要将0替换为您的即时通信 IM 应用的 SDKAppID
  }
  // 创建 SDK 实例，`TIM.create()`方法对于同一个 `SDKAppID` 只会返回同一份实例
  const tim = TIM.create(options);// SDK 实例通常用 tim 表示
  // 设置 SDK 日志输出级别，详细分级请参见 setLogLevel 接口的说明
  // tim.setLogLevel(0); // 普通级别，日志量较多，接入时建议使用
  tim.setLogLevel(1); // release 级别，SDK 输出关键信息，生产环境时建议使用
  // 注册 COS SDK 插件
  tim.registerPlugin({ 'cos-wx-sdk': COS })
  tim.registerPlugin({ 'tim-upload-plugin': TIMUploadPlugin });
  // 监听事件，例如：
  tim.on(TIM.EVENT.SDK_READY, (event) => {
    timStore.isImLogin = true
    Taro.setStorageSync('isImLogin', true)
    // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.emit('SDK_ready', event.name)
    // 收到离线消息和会话列表同步完毕通知，接入侧可以调用 sendMessage 等需要鉴权的接口
    // event.name - TIM.EVENT.SDK_READY
  });

  tim.on(TIM.EVENT.MESSAGE_RECEIVED, (event) => {
    // 若同时收到多个会话 需要根据conversationID来判断是哪个人的会话
    const msgarr = [] as any
    const newMsgForm = event.data[0].conversationID // 定义会话键值
    if (msgarr[newMsgForm]) {
      msgarr[newMsgForm].push(event.data[0])
    } else {
      msgarr[newMsgForm] = [event.data[0]]
    }
    timStore.myMessages = msgarr
    // 这里引入了一个监听器 （因为小程序没有类似vuex的状态管理器 当global里面的数据变化时不能及时同步到聊天页面 因此 这个监听器可以emit一个方法 到需要更新会话数据的页面 在那里进行赋值）
    // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.emit('testFunc', msgarr, newMsgForm) // 详情页的函数
    // 收到推送的单聊、群聊、群提示、群系统通知的新消息，可通过遍历 event.data 获取消息列表数据并渲染到页面
    // event.name - TIM.EVENT.MESSAGE_RECEIVED
    // event.data - 存储 Message 对象的数组 - [Message]
  })
  tim.on(TIM.EVENT.MESSAGE_READ_BY_PEER, (event) => {
    // SDK 收到对端已读消息的通知，即已读回执。使用前需要将 SDK 版本升级至 v2.7.0 或以上。仅支持单聊会话。
    const msgarr = [] as any

    const newMsgForm = event.data[0].conversationID // 定义会话键值
    if (msgarr[newMsgForm]) {
      msgarr[newMsgForm].push(event.data[0])
    } else {
      msgarr[newMsgForm] = [event.data[0]]
    }
    // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.emit('readItem', msgarr, newMsgForm) // 函数
    // event.name - TIM.EVENT.MESSAGE_READ_BY_PEER
    // event.data - event.data - 存储 Message 对象的数组 - [Message] - 每个 Message 对象的 isPeerRead 属性值为 true
  });
  tim.on(TIM.EVENT.CONVERSATION_LIST_UPDATED, (event) => {
    // 更新当前所有会话列表
    // 注意 这个函数在首次点击进入会话列表的时候也会执行 因此点击消息 可以显示当前的未读消息数（unreadCount表示未读数）
    timStore.isImLogin && initRecentContactList()
    // 收到会话列表更新通知，可通过遍历 event.data 获取会话列表数据并渲染到页面
    // event.name - TIM.EVENT.CONVERSATION_LIST_UPDATED
    // event.data - 存储 Conversation 对象的数组 - [Conversation]
  });

  tim.on(TIM.EVENT.SDK_NOT_READY, (event) => {
    timStore.isImLogin = false
    Taro.setStorageSync('isImLogin', false)
    loginIm_TIM(userInfo.adventureNo)
    // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.emit('SDK_no_ready', event.name)
    // 收到 SDK 进入 not ready 状态通知，此时 SDK 无法正常工作
    // event.name - TIM.EVENT.SDK_NOT_READY
  });

  tim.on(TIM.EVENT.KICKED_OUT, (event) => {
    Taro.setStorageSync('isImLogin', false)
    timStore.isImLogin = false;
    // 收到被踢下线通知
    // event.name - TIM.EVENT.KICKED_OUT
    // event.data.type - 被踢下线的原因，例如:
    //    - TIM.TYPES.KICKED_OUT_MULT_ACCOUNT 多实例登录被踢
    //    - TIM.TYPES.KICKED_OUT_MULT_DEVICE 多终端登录被踢
    //    - TIM.TYPES.KICKED_OUT_USERSIG_EXPIRED 签名过期被踢
  })
  timStore.tim = tim;
}
// 登录
const loginIm_TIM = userID => {
  const id = userID ? userID : userInfo.adventureNo
  if (!!id && !timStore.isImLogin) {
    // 开始登录
    get(`/im/getUserSign?adventureNo=${id}`).then(res => {
      Taro.setStorageSync('userSig', res.data)
      const promise = timStore.tim.login({
        userID: String(id),
        userSig: res.data
      });
      promise.then((imResponse) => {
        Taro.setStorageSync('isImLogin', true)
        timStore.isImLogin = true
        setTimeout(() => {
          // 拉取会话列表
          timStore.isImLogin && initRecentContactList()
        }, 1000);
      }).catch((imError) => {
        // Taro.showToast({
        //   title: 'login error' + imError,
        //   icon: 'none',
        //   duration: 3000
        // })
      });
    })
  }
}

// 会话列表
const initRecentContactList = () => {
  const promise = timStore.tim.getConversationList();
  if (!promise) {
    // Taro.showToast({
    //   title: 'SDK not ready',
    //   icon: 'none',
    //   duration: 3000
    // })
    return
  }
  let conversationList = [] as any
  promise.then((imResponse) => {
    // 如果最后一条消息是自定义消息的话，处理一下data
    conversationList = imResponse.data.conversationList; // 会话列表，用该列表覆盖原有的会话列表
    conversationList.forEach(event => {
      if (event.lastMessage.type === 'TIMCustomElem') {
        const data = event.lastMessage.payload.data
        let new_data = ''
        if (typeof (data) === 'string' && data) {
          new_data = JSON.parse(data)
        }
        event.lastMessage.payload.data = new_data
      }
    })
    let number = 0
    conversationList.forEach(ele => {
      number = number + ele.unreadCount
    })
    // console.log('initRecentContactList', number)
    //更新获取未读消息角标 采用了mbox方式传入
    roomStore.updateRoomNum(number)
    const list = conversationList as any
    // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.emit('conversationList', list) // 函数
    timStore.conversationList = list
    Taro.setStorageSync('conversationList', list)
  }).catch((imError) => {
    // Taro.showToast({
    //   title: 'getConversationList error:' + imError,
    //   icon: 'none',
    //   duration: 3000
    // })
  })
}
// 删除会话
function deleteConversation_TIM(ID) {
  const promise = timStore.tim.deleteConversation(ID);
  promise.then((imResponse) => {
    // 删除成功。
    const { conversationID } = imResponse.data;// 被删除的会话 ID
    const oldList = Taro.getStorageSync('conversationList')
    const newList = oldList.filter((item: any) => conversationID !== item.conversationID)
    Taro.setStorageSync('conversationList', newList)
  })
}

export { iminit_TIM, loginIm_TIM, initRecentContactList, deleteConversation_TIM }
```


### 获取列表
hooks方式
```
const [list, setList] = useState([] as any);
 useEffect(() => {
    // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.on("conversationList", (lists: any) => {
      if (lists.length > 0) {
        timStore.isImLogin &&
          setList(
            lists ? lists : timStore.conversationList
          );
      }
    });
  }, []);
  ```

  ### 获取聊天会话

  ```
   // 发送信息
  const [sendMsg, setSendMsg] = useState("" as any);
  // im实时聊天数据
  const [toView, setToView] = useState("" as any);
  // 用于续拉，分页续拉时需传入该字段。
  const [nextReqMessageID, setNextReqMessageID] = useState("" as any);
  // 表示是否已经拉完所有消息。
  const [isCompleted, setIsCompleted] = useState("" as any);

  // 消息列表
  const [myMessages, setmyMessages] = useState([] as any);
  const [more_text, setmore_text] = useState("");
  const [is_lock, setis_lock] = useState(true);

  // 语音操作
  const [title, settitle] = useState("正在录音");
  const [isRecording, setisRecording] = useState(false);
  // 拉取会话列表
  const getMsgList = () => {
    const param = {
        //sendId 为对方id
      conversationID: "C2C" + sendId,
      count: 15,
      nextReqMessageID
    };
    const promise = timStore.tim.getMessageList(param);

    promise
      .then(imResponse => {
        const messageList = imResponse.data.messageList; // 消息列表。
        // 处理自定义的消息
        messageList.forEach(event => {
          if (event.type === "TIMCustomElem") {
            if (typeof event.payload.data === "string" && event.payload.data) {
              const new_data = JSON.parse(event.payload.data);
              event.payload.data = new_data;
            }
          }
        });
        const newNextReqMessageID = imResponse.data.nextReqMessageID; // 用于续拉，分页续拉时需传入该字段。
        const newIsCompleted = imResponse.data.isCompleted; // 表示是否已经拉完所有消息。
        // 将某会话下所有未读消息已读上报
        setMessageRead();
        setmyMessages(messageList);
        setIsCompleted(newIsCompleted);
        setNextReqMessageID(newNextReqMessageID);
        setmore_text(newIsCompleted ? "没有更多了" : "下拉查看更多历史信息");
        scrollToBottom(messageList.length - 1);
      })
      .catch(imError => {
        // console.warn("getConversationList error:", imError); // 获取会话列表失败的相关信息
      });
  };
  ```

### 已读回执

```
// 已读回执
  // @ts-ignore
  // eslint-disable-next-line no-undef
  wx.event.on("readItem", (ele, newMsgForm) => {
    if (newMsgForm === `C2C${sendId}` && timStore.isDetail) {
      const newmsg = ele[`C2C${sendId}`];
      const oldItems = deepCopy(myMessages);
      if (newmsg) {
        newmsg.forEach(event => {
          if (event.type === "TIMCustomElem") {
            if (typeof event.payload.data === "string" && event.payload.data) {
              const new_data = JSON.parse(event.payload.data);
              event.payload.data = new_data;
            }
          }
        });
        let newitems = oldItems.filter(
          (item: any) => !newmsg.some((dom: any) => dom.ID === item.ID)
        );
        newitems = [...newitems, ...newmsg];
        setmyMessages(newitems);
        scrollToBottom(newitems.length - 1);
      }
    }
  });
  ```

  ### 接受到新消息

  ```
   // @ts-ignore
    // eslint-disable-next-line no-undef
    wx.event.on("testFunc", (ele, newMsgForm) => {
      if (newMsgForm === `C2C${sendId}` && timStore.isDetail) {
        const newmsg = ele[`C2C${sendId}`];
        let oldMss = myMessages;
        if (newmsg) {
          newmsg.forEach(event => {
            if (event.type === "TIMCustomElem") {
              if (
                typeof event.payload.data === "string" &&
                event.payload.data
              ) {
                const new_data = JSON.parse(event.payload.data);
                event.payload.data = new_data;
              }
            }
            if (!event.isRead) {
              oldMss = [...oldMss, ...newmsg];
            }
          });
          setmyMessages(oldMss);
          scrollToBottom(oldMss.length - 1);
        }
        setMessageRead();
      }
    });
```

### 设置已读上报

```
const setMessageRead = () => {
    const promise = timStore.tim.setMessageRead({
      conversationID: "C2C" + sendId
    });
    promise
      .then(imResponse => {
        initRecentContactList();
        // 已读上报成功
        let noready = 0;
        const messages = myMessages as any;
        messages.forEach(event => {
          if (!event.isRead) {
            noready++;
          }
        });
        const number = Taro.getStorageSync("number_msg");
        const newNumber = number - noready;
        Taro.setStorageSync("number_msg", newNumber);
        roomStore.updateRoomNum(newNumber);
      })
      .catch(imError => {
        // 已读上报失败
        // console.warn("setMessageRead error:", imError);
      });
  };
```

### 发送文本消息

```
 // 发送普通文本消息
  const bindConfirm = () => {
    if (is_lock) {
      setis_lock(false);
      if (sendMsg.length === 0) {
        Taro.showToast({
          title: "消息不能为空!",
          icon: "none"
        });
        setis_lock(true);
        return;
      }

      const content = {
        text: sendMsg
      };

      const options = {
        to: sendId, // 消息的接收方
        conversationType: TIM.TYPES.CONV_C2C, // 会话类型取值timStore.tim.TYPES.CONV_C2C或timStore.tim.TYPES.CONV_GROUP
        payload: content // 消息内容的容器
      };
      // // 发送文本消息，Web 端与小程序端相同
      // 1. 创建消息实例，接口返回的实例可以上屏
      const message = timStore.tim.createTextMessage(options);
      // 2. 发送消息
      sendMessageFun(message, "text");
    }
  };
```

 ### 发送语音图片和视频消息
   ```
    // 发送语音消息
  const bindAudioMessage = res => {
    // 4. 创建消息实例，接口返回的实例可以上屏
    const message = timStore.tim.createAudioMessage({
      to: sendId, // 消息的接收方
      conversationType: TIM.TYPES.CONV_C2C,
      payload: {
        file: res
      }
    });
    sendMessageFun(message, "voice");
  };
  // 发送视频
  const createVideoMessage = res => {
    // 2. 创建消息实例，接口返回的实例可以上屏
    const message = timStore.tim.createVideoMessage({
      to: sendId,
      conversationType: TIM.TYPES.CONV_C2C,
      payload: {
        file: res
      }
    });
    // 3. 发送消息
    sendMessageFun(message, "video");
  };
  // 发送图片
  const createImageMessage = res => {
    const message = timStore.tim.createImageMessage({
      to: sendId,
      conversationType: TIM.TYPES.CONV_C2C,
      payload: {
        file: res
      },
      onProgress(event) {
        setProgress(event);
      }
    });
    sendMessageFun(message, "image");
  };
```

### 发送消息封装

```
const sendMessageFun = (message, type) => {
    Taro.showLoading({ title: "发送中" });
    const promise = timStore.tim.sendMessage(message);
    promise.then(imResponse => {
      // 发送成功
      setMessageRead();
      const messageList = myMessages as any;
      messageList.push(imResponse.data.message);
      setis_lock(true);
      setmyMessages(messageList);
      clearInput();
      scrollToBottom(messageList.length - 1);
      Taro.hideLoading({});
    });
  };
```

