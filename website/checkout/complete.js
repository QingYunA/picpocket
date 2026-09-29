(function () {
  var params = new URLSearchParams(location.search);
  var cancelled = params.get('status') === 'cancel';
  var zh = (navigator.language || '').toLowerCase().indexOf('zh') === 0;
  var TEXT = zh
    ? {
        successTitle: '付款完成',
        successBody: '感谢支持！会员或积分会在一分钟内到账，回到 PicPocket 扩展即可使用。可以关闭此页面。',
        cancelTitle: '已取消付款',
        cancelBody: '没有产生任何扣款。需要时可以回到 PicPocket 扩展重新选择套餐。'
      }
    : {
        successTitle: 'Payment complete',
        successBody: 'Thank you! Your plan or credits will be ready in PicPocket within a minute. You can close this page.',
        cancelTitle: 'Payment cancelled',
        cancelBody: 'You were not charged. You can choose a plan again from the PicPocket extension at any time.'
      };
  document.documentElement.lang = zh ? 'zh' : 'en';
  document.title = (cancelled ? TEXT.cancelTitle : TEXT.successTitle) + ' — PicPocket';
  document.getElementById('title').textContent = cancelled ? TEXT.cancelTitle : TEXT.successTitle;
  if (window.umami && window.umami.track) window.umami.track(cancelled ? 'checkout_cancelled' : 'checkout_completed');
  document.getElementById('body').textContent = cancelled ? TEXT.cancelBody : TEXT.successBody;
})();
