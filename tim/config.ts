import Taro from "@tarojs/taro";
import TIM from 'tim-wx-sdk';
import COS from "cos-wx-sdk-v5"
import TIMUploadPlugin from 'tim-upload-plugin';
// mbox 存储数据
import roomStore from "~/store/room";
import timStore from '~/store/tim'
// sdk
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
    // 更新获取未读消息角标 采用了mbox方式传入
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
