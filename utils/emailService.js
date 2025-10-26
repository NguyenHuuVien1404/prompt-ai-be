const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true cho 465, false cho 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Tùy chọn nếu gặp lỗi SSL
  },
  pool: true, // Dùng connection pool để tái sử dụng kết nối
  maxMessages: 100, // Giới hạn số email mỗi kết nối
  rateLimit: 10, // Giới hạn 10 email/giây
  rateDelta: 1000, // Thời gian tính rate (1 giây)
});
{
  /* <div style="margin-top: 20px; font-size: 12px; color: #666;">
                        <div>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/facebook.png" alt="Facebook" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/instagram-new.png" alt="Instagram" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/twitter.png" alt="Twitter" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/youtube-play.png" alt="YouTube" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/pinterest.png" alt="Pinterest" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                        </div>
                        <p>Copyright © 2024 by Prom</p>
                    </div> */
}
async function sendOrderEmail(email, userName, orderId = 1) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ghi nhận thông tin #${orderId}</title>
        <style type="text/css">
            body { font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 20px; }
            table { border-collapse: collapse; }
            img { display: block; max-width: 100%; height: auto; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; }
            .content { background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
            .ad-desktop { display: block; }
            .ad-mobile { display: none; }
            @media only screen and (max-width: 600px) {
                .container { width: 100%; padding: 10px; }
                .content { padding: 15px; }
                .ad-desktop { display: none; }
                .ad-mobile { display: block; }
            }
        </style>
    </head>
    <body>
        <table class="container" cellpadding="0" cellspacing="0" align="center">
            <tr>
                <td align="center">
                    <!-- Logo -->
                    <img src="https://s3-alpha-sig.figma.com/img/c9e6/61f6/a057c97fc6850110c478f8cb0d421ed8?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=jVtY6Ugqb7mB3SAXocs0WOp~CCkgkmgqHrnSZC7jx0IANiw7rHVXBCIyutOi9kmwWTrMo7-3Kr7DKTGK1W3Hxt8hqKg1AuWxwXKdfxnYvB3chzA1RkllmfnqtSF4KnpheSzBi3MxypjGwl1LRFxMGHcG1B15K5jSm5Surw22zvwFpRjvqNZhm7WaoQPFvQxwKM~VJSmKtU1k~TwqvHHP7KrVN9-9kIxQLjts0yLfGHNkEpuc5GoptCRC9AtES6g4qhIxZETpsR0xKy6FrAKgiWg0xif5NDYP7qxCzTipSRzZ3-Govy8WK9v92adDKz6-bYqrsBxTb2LjFB2DVtNdDg__" alt="Prom Logo" style="max-width: 150px;">

                    <!-- Greeting -->
                    <div style="font-size: 24px; font-weight: bold; margin: 20px 0 10px; color: #333;">
                        Xin chào ${userName},<br>Ghi nhận thông tin #${orderId}
                    </div>

                    <!-- Content -->
                    <table class="content" cellpadding="0" cellspacing="0">
                        <tr>
                            <td align="center">
                                <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                                    Xin chào ${userName},<br>
                                    Chúng tôi đã nhận thông tin của ${userName} theo đơn hàng #${orderId}.<br>
                                    Nhân viên của chúng tôi sẽ gửi đến cho ${userName} trong thời gian sớm nhất. Hoặc vui lòng liên lạc qua số điện thoại hotline của chúng tôi: 123-456-789
                                </div>
                                <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                                    Trân trọng,<br>Prom
                                </div>
                                <div style="font-size: 14px; color: #4b0082; margin-bottom: 20px;">
                                    Bạn có thể kiểm tra thông tin đơn hàng tại đây: 
                                    <a href="http://prom.com/order/${orderId}" style="color: #4b0082;">http://prom.com/order/${orderId}</a>
                                </div>
                                <a href="http://prom.com" style="display: inline-block; padding: 10px 20px; background-color: #4b0082; color: #fff; text-decoration: none; border-radius: 5px; font-size: 16px;">
                                    Vào website
                                </a>
                            </td>
                        </tr>
                    </table>

                    <!-- Ad Section -->
                    <table cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                        <tr>
                            <td align="center">
                                <div class="ad-desktop">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/0532/544b/b7f130b5db2a808e46aa0198099cf28a?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=GavAo1dx14lv7t51U-sbwq9PLFKN7P0zgJ2mMmXDfiBSWWLSYwFVkfWHzyqvxoOeJbj32tDABOxDi1bWEL-oRd2Vq8MKIlvQIWcwJ89L0AfSdhlu1bR3GUnCctKNxjJUXU9H3CAGPFoaI6ewVCnuXd4WDZm2ynFXNDXn5E9ZgQ4llaixMlMso-qoXGHzkv2ra1JFJ3xmqyhsQAVgX7AO91yJ~H3VbvFYGWlMG1hKvDCt2dZI0T6zm-RaODKLOE3YAm6~NtRJjIesXNpUXp3ECVEE5MRmiulCbtnm6qF-g1gC2ES-CfHuLEd~KicapcHVCemL8qxlIcJaSpJIzhAPGw__" alt="Ad Astronaut">
                                    </a>
                                </div>
                                <div class="ad-mobile">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/c23a/4d18/47f9c03e8deeeedfc1e1e48e834b105f?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=Za1m95LdvRWWB69gqXgxJHi1SIfAduR-VNQ3jj022oyXgXxYB8PmEUnsuKU6i1i7AgnfbIdptsj9Vznr-vJa3sr-lct0o0cwBdkW0JuvYRkJjaq7j0085~xQOBPZJ3R1zabrU3Ny8u6FsWDu95KchTdHI9VeprI7tytGZcs6XFL~hFvagLh6EM1NwoamWDgLDWZBH3VmuXGjTmwJ2xnlcSEUpY2XOjCytpQSCFEl7-XuhIh6ykV5T1BlEOypPMVzSASJOFzHI78-Q-uGF15XH0QGPdcumjB2y4sbgAImQZmwyovG~zifl5R-iMrbKc878N7hrse1MP~txfeuJjsGTQ__" alt="Ad Astronaut">
                                    </a>
                                </div>
                            </td>
                        </tr>
                    </table>

                    <!-- Footer -->
                    <div style="margin-top: 20px; font-size: 12px; color: #666;">
                        <div>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/facebook.png" alt="Facebook" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/instagram-new.png" alt="Instagram" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/twitter.png" alt="Twitter" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/youtube-play.png" alt="YouTube" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                            <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/pinterest.png" alt="Pinterest" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
                        </div>
                        <p>Copyright © 2024 by Prom</p>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Ghi nhận thông tin #${orderId}`,
    html: htmlTemplate,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

async function sendOtpEmail(email, otp) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mã xác thực OTP</title>
        <style type="text/css">
            body { font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 0; }
            table { border-collapse: collapse; }
            img { display: block; max-width: 100%; height: auto; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; height: 700px; } /* Fix cứng chiều cao */
            .content { background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
            .ad-desktop { display: block; }
            .ad-mobile { display: none; }
            @media only screen and (max-width: 600px) {
                .container { width: 100%; padding: 10px; height: 600px; } /* Chiều cao nhỏ hơn cho mobile */
                .content { padding: 15px; }
                .ad-desktop { display: none; }
                .ad-mobile { display: block; }
            }
        </style>
    </head>
    <body>
        <table class="container" cellpadding="0" cellspacing="0" align="center" style="background-color: #f5f5ff;">
            <tr>
                <td align="center" style="padding: 20px; vertical-align: top;">
                    <!-- Logo -->
                    <img src="https://s3-alpha-sig.figma.com/img/c9e6/61f6/a057c97fc6850110c478f8cb0d421ed8?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=jVtY6Ugqb7mB3SAXocs0WOp~CCkgkmgqHrnSZC7jx0IANiw7rHVXBCIyutOi9kmwWTrMo7-3Kr7DKTGK1W3Hxt8hqKg1AuWxwXKdfxnYvB3chzA1RkllmfnqtSF4KnpheSzBi3MxypjGwl1LRFxMGHcG1B15K5jSm5Surw22zvwFpRjvqNZhm7WaoQPFvQxwKM~VJSmKtU1k~TwqvHHP7KrVN9-9kIxQLjts0yLfGHNkEpuc5GoptCRC9AtES6g4qhIxZETpsR0xKy6FrAKgiWg0xif5NDYP7qxCzTipSRzZ3-Govy8WK9v92adDKz6-bYqrsBxTb2LjFB2DVtNdDg__" alt="Prom Logo" style="max-width: 150px;">

                    <!-- Greeting -->
                    <div style="font-size: 24px; font-weight: bold; margin: 20px 0 10px; color: #333;">
                        Xin chào bạn, hãy nhập mã xác thực OTP bên dưới
                    </div>

                    <!-- Content -->
                    <table class="content" cellpadding="0" cellspacing="0" style="width: 100%;">
                        <tr>
                            <td align="center">
                                <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                                    Mã xác thực của bạn là <strong style="font-size: 25px;">${otp}</strong>
                                </div>
                                <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                                    Trân trọng,<br>Prom
                                </div>
                            </td>
                        </tr>
                    </table>

                    <!-- Ad Section -->
                    <table cellpadding="0" cellspacing="0" style="margin-top: 20px; width: 100%;">
                        <tr>
                            <td align="center">
                                <div class="ad-desktop">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/0532/544b/b7f130b5db2a808e46aa0198099cf28a?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=GavAo1dx14lv7t51U-sbwq9PLFKN7P0zgJ2mMmXDfiBSWWLSYwFVkfWHzyqvxoOeJbj32tDABOxDi1bWEL-oRd2Vq8MKIlvQIWcwJ89L0AfSdhlu1bR3GUnCctKNxjJUXU9H3CAGPFoaI6ewVCnuXd4WDZm2ynFXNDXn5E9ZgQ4llaixMlMso-qoXGHzkv2ra1JFJ3xmqyhsQAVgX7AO91yJ~H3VbvFYGWlMG1hKvDCt2dZI0T6zm-RaODKLOE3YAm6~NtRJjIesXNpUXp3ECVEE5MRmiulCbtnm6qF-g1gC2ES-CfHuLEd~KicapcHVCemL8qxlIcJaSpJIzhAPGw__" alt="Ad Astronaut" style="max-width: 500px;">
                                    </a>
                                </div>
                                <div class="ad-mobile">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/c23a/4d18/47f9c03e8deeeedfc1e1e48e834b105f?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=Za1m95LdvRWWB69gqXgxJHi1SIfAduR-VNQ3jj022oyXgXxYB8PmEUnsuKU6i1i7AgnfbIdptsj9Vznr-vJa3sr-lct0o0cwBdkW0JuvYRkJjaq7j0085~xQOBPZJ3R1zabrU3Ny8u6FsWDu95KchTdHI9VeprI7tytGZcs6XFL~hFvagLh6EM1NwoamWDgLDWZBH3VmuXGjTmwJ2xnlcSEUpY2XOjCytpQSCFEl7-XuhIh6ykV5T1BlEOypPMVzSASJOFzHI78-Q-uGF15XH0QGPdcumjB2y4sbgAImQZmwyovG~zifl5R-iMrbKc878N7hrse1MP~txfeuJjsGTQ__" alt="Ad Astronaut" style="max-width: 300px;">
                                    </a>
                                </div>
                            </td>
                        </tr>
                    </table>

                    <!-- Footer -->
                    
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Mã xác thực OTP`,
    html: htmlTemplate,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
async function sendReplyEmail(email, reply) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mã xác thực OTP</title>
        <style type="text/css">
            body { font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 0; }
            table { border-collapse: collapse; }
            img { display: block; max-width: 100%; height: auto; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; height: 700px; } /* Fix cứng chiều cao */
            .content { background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
            .ad-desktop { display: block; }
            .ad-mobile { display: none; }
            @media only screen and (max-width: 600px) {
                .container { width: 100%; padding: 10px; height: 600px; } /* Chiều cao nhỏ hơn cho mobile */
                .content { padding: 15px; }
                .ad-desktop { display: none; }
                .ad-mobile { display: block; }
            }
        </style>
    </head>
    <body>
        <table class="container" cellpadding="0" cellspacing="0" align="center" style="background-color: #f5f5ff;">
            <tr>
                <td align="center" style="padding: 20px; vertical-align: top;">
                    <!-- Logo -->
                    <img src="https://prom.vn/static/media/logo.9df983d067d02d662f7a.png" alt="Prom Logo" style="max-width: 150px;">

                    <!-- Greeting -->
                    <div style="font-size: 24px; font-weight: bold; margin: 20px 0 10px; color: #333;">
                        Xin chào bạn, dưới đây là Prompt cá nhân hóa của bạn
                    </div>

                    <!-- Content -->
                    <table class="content" cellpadding="0" cellspacing="0" style="width: 100%;">
                        <tr>
                            <td align="center">
                                <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                                    ${reply}
                                </div>
                                <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                                    Trân trọng,<br>Prom
                                </div>
                            </td>
                        </tr>
                    </table>

                    <!-- Ad Section -->
                    <table cellpadding="0" cellspacing="0" style="margin-top: 20px; width: 100%;">
                        <tr>
                            <td align="center">
                                <div class="ad-desktop">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/0532/544b/b7f130b5db2a808e46aa0198099cf28a?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=GavAo1dx14lv7t51U-sbwq9PLFKN7P0zgJ2mMmXDfiBSWWLSYwFVkfWHzyqvxoOeJbj32tDABOxDi1bWEL-oRd2Vq8MKIlvQIWcwJ89L0AfSdhlu1bR3GUnCctKNxjJUXU9H3CAGPFoaI6ewVCnuXd4WDZm2ynFXNDXn5E9ZgQ4llaixMlMso-qoXGHzkv2ra1JFJ3xmqyhsQAVgX7AO91yJ~H3VbvFYGWlMG1hKvDCt2dZI0T6zm-RaODKLOE3YAm6~NtRJjIesXNpUXp3ECVEE5MRmiulCbtnm6qF-g1gC2ES-CfHuLEd~KicapcHVCemL8qxlIcJaSpJIzhAPGw__" alt="Ad Astronaut" style="max-width: 500px;">
                                    </a>
                                </div>
                                <div class="ad-mobile">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/c23a/4d18/47f9c03e8deeeedfc1e1e48e834b105f?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=Za1m95LdvRWWB69gqXgxJHi1SIfAduR-VNQ3jj022oyXgXxYB8PmEUnsuKU6i1i7AgnfbIdptsj9Vznr-vJa3sr-lct0o0cwBdkW0JuvYRkJjaq7j0085~xQOBPZJ3R1zabrU3Ny8u6FsWDu95KchTdHI9VeprI7tytGZcs6XFL~hFvagLh6EM1NwoamWDgLDWZBH3VmuXGjTmwJ2xnlcSEUpY2XOjCytpQSCFEl7-XuhIh6ykV5T1BlEOypPMVzSASJOFzHI78-Q-uGF15XH0QGPdcumjB2y4sbgAImQZmwyovG~zifl5R-iMrbKc878N7hrse1MP~txfeuJjsGTQ__" alt="Ad Astronaut" style="max-width: 300px;">
                                    </a>
                                </div>
                            </td>
                        </tr>
                    </table>

                    <!-- Footer -->
                    
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Prompt cá nhân hóa`,
    html: htmlTemplate,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
async function sendSurveyEmail(email, reply) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mã xác thực OTP</title>
        <style type="text/css">
            body { font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 0; }
            table { border-collapse: collapse; }
            img { display: block; max-width: 100%; height: auto; }
            .container { width: 100%; max-width: 900px; margin: 0 auto; height: 700px; } /* Fix cứng chiều cao */
            .content { background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
            .ad-desktop { display: block; }
            .ad-mobile { display: none; }
            @media only screen and (max-width: 600px) {
                .container { width: 100%; padding: 10px; height: 600px; } /* Chiều cao nhỏ hơn cho mobile */
                .content { padding: 15px; }
                .ad-desktop { display: none; }
                .ad-mobile { display: block; }
            }
        </style>
    </head>
<body style="font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5ff;">
    <tr>
      <td align="center">
        <table width="900" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 10px; box-shadow: 0 0 10px #0001; margin: 40px auto;">
          <tr>
            <td align="center" style="padding: 20px;">
              <!-- Logo -->
              <img src="https://prom.vn/static/media/logo.9df983d067d02d662f7a.png" alt="Prom Logo" style="max-width: 150px; margin-bottom: 20px;">
              <!-- Greeting -->
              <div style="font-size: 24px; font-weight: bold; margin: 20px 0 10px; color: #333;">
                Xin chào bạn, dưới đây là Survey / Phiếu Khảo Sát
              </div>
              <!-- Content -->
              <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                ${reply}
              </div>
              <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                Trân trọng,<br>Prom
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
    </html>
    `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Survey / Phiếu Khảo Sát`,
    html: htmlTemplate,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
async function sendFeedbackEmail(
  userEmail,
  userName,
  userPhone,
  feedbackName,
  feedbackMessage
) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Feedback từ người dùng</title>
        <style type="text/css">
            body { font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 0; }
            table { border-collapse: collapse; }
            img { display: block; max-width: 100%; height: auto; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; }
            .content { background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
        </style>
    </head>
    <body>
        <table class="container" cellpadding="0" cellspacing="0" align="center" style="background-color: #f5f5ff;">
            <tr>
                <td align="center" style="padding: 20px;">
                    <!-- Logo -->
                    <img src="https://s3-alpha-sig.figma.com/img/c9e6/61f6/a057c97fc6850110c478f8cb0d421ed8?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=jVtY6Ugqb7mB3SAXocs0WOp~CCkgkmgqHrnSZC7jx0IANiw7rHVXBCIyutOi9kmwWTrMo7-3Kr7DKTGK1W3Hxt8hqKg1AuWxwXKdfxnYvB3chzA1RkllmfnqtSF4KnpheSzBi3MxypjGwl1LRFxMGHcG1B15K5jSm5Surw22zvwFpRjvqNZhm7WaoQPFvQxwKM~VJSmKtU1k~TwqvHHP7KrVN9-9kIxQLjts0yLfGHNkEpuc5GoptCRC9AtES6g4qhIxZETpsR0xKy6FrAKgiWg0xif5NDYP7qxCzTipSRzZ3-Govy8WK9v92adDKz6-bYqrsBxTb2LjFB2DVtNdDg__" alt="Prom Logo" style="max-width: 150px; margin-bottom: 20px;">

                    <!-- Greeting -->
                    <div style="font-size: 24px; font-weight: bold; margin: 20px 0 10px; color: #333;">
                        Feedback từ người dùng
                    </div>

                    <!-- Content -->
                    <table class="content" cellpadding="0" cellspacing="0" style="width: 100%;">
                        <tr>
                            <td>
                                <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                                    <p><strong>Email người dùng:</strong> ${userEmail}</p>
                                    <p><strong>Tên:</strong> ${feedbackName}</p>
                                    <p><strong>Số điện thoại:</strong> ${userPhone}</p>
                                    <p><strong>Nội dung feedback:</strong></p>
                                    <p style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #4b0082;">${
                                      feedbackMessage || ""
                                    }</p>
                                </div>
                                <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                                    Trân trọng,<br>Prom
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

  const emailList = ["hoang94nhan@gmail.com", "quocdat.asean@gmail.com"];

  for (const email of emailList) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Feedback từ ${feedbackName}`,
      html: htmlTemplate,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error(`Error sending feedback email to ${email}:`, error);
      throw error;
    }
  }
}

async function sendSkoolInviteEmail(
  email,
  userName,
  subscriptionName,
  orderId
) {
  const skoolUrl =
    process.env.SKOOL_INVITE ||
    "https://www.skool.com/prom-aihub/about?ref=1a6136e6caba48bcaf8d6a8120bc0cb8";

  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chào mừng bạn đến với Prom AI Hub!</title>
        <style type="text/css">
            body { font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 20px; }
            table { border-collapse: collapse; }
            img { display: block; max-width: 100%; height: auto; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; }
            .content { background-color: #fff; padding: 30px; border-radius: 15px; box-shadow: 0 0 20px rgba(0, 0, 0, 0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #4a90e2; margin-bottom: 10px; }
            .title { font-size: 24px; color: #333; margin-bottom: 20px; }
            .message { font-size: 16px; line-height: 1.6; color: #555; margin-bottom: 25px; }
            .cta-button { 
                display: inline-block; 
                background: linear-gradient(135deg, #4a90e2, #357abd); 
                color: white; 
                padding: 15px 30px; 
                text-decoration: none; 
                border-radius: 25px; 
                font-weight: bold; 
                font-size: 18px;
                margin: 20px 0;
                box-shadow: 0 4px 15px rgba(74, 144, 226, 0.3);
                transition: all 0.3s ease;
            }
            .cta-button:hover { 
                transform: translateY(-2px); 
                box-shadow: 0 6px 20px rgba(74, 144, 226, 0.4);
            }
            .order-info { 
                background-color: #f8f9fa; 
                padding: 20px; 
                border-radius: 10px; 
                margin: 20px 0; 
                border-left: 4px solid #4a90e2;
            }
            .order-info h3 { color: #4a90e2; margin-top: 0; }
            .order-info p { margin: 5px 0; color: #666; }
            .benefits { margin: 25px 0; }
            .benefits h3 { color: #4a90e2; margin-bottom: 15px; }
            .benefits ul { list-style: none; padding: 0; }
            .benefits li { 
                padding: 8px 0; 
                color: #555; 
                position: relative; 
                padding-left: 25px;
            }
            .benefits li:before { 
                content: "✓"; 
                color: #4a90e2; 
                font-weight: bold; 
                position: absolute; 
                left: 0;
            }
            .footer { 
                text-align: center; 
                margin-top: 30px; 
                padding-top: 20px; 
                border-top: 1px solid #eee; 
                color: #888; 
                font-size: 14px;
            }
            .social-links { margin: 15px 0; }
            .social-links a { 
                display: inline-block; 
                margin: 0 10px; 
                text-decoration: none; 
                color: #4a90e2;
            }
            @media only screen and (max-width: 600px) {
                .container { width: 100%; padding: 10px; }
                .content { padding: 20px; }
                .title { font-size: 20px; }
                .cta-button { padding: 12px 25px; font-size: 16px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="content">
                <div class="header">
                    <div class="logo">🚀 Prom AI Hub</div>
                    <h1 class="title">Chào mừng bạn đến với cộng đồng!</h1>
                </div>
                
                <div class="message">
                    <p>Xin chào <strong>${userName}</strong>,</p>
                    <p>Cảm ơn bạn đã tin tưởng và mua gói <strong>${subscriptionName}</strong>! Chúng tôi rất vui được chào đón bạn vào cộng đồng Prom AI Hub trên Skool.</p>
                </div>

                <div class="order-info">
                    <h3>📋 Thông tin đơn hàng</h3>
                    <p><strong>Mã đơn hàng:</strong> #${orderId}</p>
                    <p><strong>Gói đã mua:</strong> ${subscriptionName}</p>
                    <p><strong>Trạng thái:</strong> ✅ Đã thanh toán thành công</p>
                </div>

                <div class="benefits">
                    <h3>🎯 Những gì bạn sẽ nhận được:</h3>
                    <ul>
                        <li>Truy cập vào cộng đồng độc quyền trên Skool</li>
                        <li>Chia sẻ và học hỏi kinh nghiệm với các thành viên khác</li>
                        <li>Nhận hỗ trợ trực tiếp từ team Prom AI</li>
                        <li>Cập nhật các tính năng mới nhất</li>
                        <li>Tham gia các sự kiện và workshop đặc biệt</li>
                        <li>Tài liệu và hướng dẫn chi tiết</li>
                    </ul>
                </div>

                <div style="text-align: center;">
                    <a href="${skoolUrl}" class="cta-button">🎉 Tham gia cộng đồng ngay!</a>
                </div>

                <div class="message">
                    <p><strong>Lưu ý quan trọng:</strong></p>
                    <p>• Link trên sẽ đưa bạn trực tiếp vào cộng đồng Skool</p>
                    <p>• Nếu bạn chưa có tài khoản Skool, hãy tạo tài khoản miễn phí</p>
                    <p>• Sau khi tham gia, bạn sẽ có quyền truy cập đầy đủ vào tất cả nội dung</p>
                </div>

                <div class="footer">
                    <p>Nếu bạn có bất kỳ câu hỏi nào, đừng ngần ngại liên hệ với chúng tôi!</p>
                    <div class="social-links">
                        <a href="#">📧 Email Support</a>
                        <a href="#">💬 Live Chat</a>
                    </div>
                    <p>Copyright © 2024 Prom AI Hub. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Prom AI Hub" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🎉 Chào mừng bạn đến với Prom AI Hub - Đơn hàng #${orderId}`,
    html: htmlTemplate,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(
      `Skool invite email sent successfully to ${email}:`,
      info.messageId
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending Skool invite email to ${email}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendOtpEmail,
  sendOrderEmail,
  sendReplyEmail,
  sendSurveyEmail,
  sendFeedbackEmail,
  sendSkoolInviteEmail,
};
