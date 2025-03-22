const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true cho 465, false cho 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false // Tùy chọn nếu gặp lỗi SSL
    },
    // debug: true, // Bật debug
    // logger: true // Ghi log chi tiết
});
{/* <div style="margin-top: 20px; font-size: 12px; color: #666;">
<div>
    <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/facebook.png" alt="Facebook" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
    <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/instagram-new.png" alt="Instagram" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
    <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/twitter.png" alt="Twitter" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
    <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/youtube-play.png" alt="YouTube" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
    <a href="#"><img src="https://img.icons8.com/ios-filled/50/000000/pinterest.png" alt="Pinterest" style="width: 24px; margin: 0 5px; border: 1px solid gray; padding: 5px; border-radius: 50%;"></a>
</div>
<p>Copyright © 2024 by Prom</p>
</div> */}
async function sendOrderEmail(email, userName, orderId = 1) {
    // Template HTML với inline CSS và xử lý ảnh khác nhau giữa mobile và desktop
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ghi nhận thông tin #${orderId}</title>
        <style type="text/css">
            /* CSS cơ bản cho các email client hỗ trợ */
            .ad-astronaut-image { display: block !important; width: 100% !important; height: auto !important; }
            .ad-astronaut-image-mobile { display: none !important; width: 0 !important; height: 0 !important; }

            /* Media query cho các client hỗ trợ (như Apple Mail) */
            @media only screen and (max-width: 600px) {
                .ad-astronaut-image { display: none !important; width: 0 !important; height: 0 !important; }
                .ad-astronaut-image-mobile { display: block !important; width: 100% !important; height: auto !important; }
            }
        </style>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 20px;">
        <table align="center" width="80%" style="width: 80%; min-height: 100vh;" cellpadding="0" cellspacing="0">
            <tr>
                <td align="center">
                    <!-- Logo -->
                    <div style="margin-bottom: 20px;">
                        <img src="https://s3-alpha-sig.figma.com/img/c9e6/61f6/a057c97fc6850110c478f8cb0d421ed8?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=jVtY6Ugqb7mB3SAXocs0WOp~CCkgkmgqHrnSZC7jx0IANiw7rHVXBCIyutOi9kmwWTrMo7-3Kr7DKTGK1W3Hxt8hqKg1AuWxwXKdfxnYvB3chzA1RkllmfnqtSF4KnpheSzBi3MxypjGwl1LRFxMGHcG1B15K5jSm5Surw22zvwFpRjvqNZhm7WaoQPFvQxwKM~VJSmKtU1k~TwqvHHP7KrVN9-9kIxQLjts0yLfGHNkEpuc5GoptCRC9AtES6g4qhIxZETpsR0xKy6FrAKgiWg0xif5NDYP7qxCzTipSRzZ3-Govy8WK9v92adDKz6-bYqrsBxTb2LjFB2DVtNdDg__" alt="Prom Logo" style="max-width: 150px; height: auto;">
                    </div>

                    <!-- Greeting -->
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">
                        Xin chào ${userName},<br>Ghi nhận thông tin #${orderId}
                    </div>

                    <!-- Container -->
                    <table width="90%" style="background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin: 0 auto;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td align="center">
                                <!-- Message -->
                                <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                                    Xin chào ${userName},<br>
                                    Chúng tôi đã nhận thông tin của ${userName} theo đơn hàng #${orderId}.<br>
                                    Nhân viên của chúng tôi sẽ gửi đến cho ${userName} trong thời gian sớm nhất. Hoặc vui lòng liên lạc qua số điện thoại hotline của chúng tôi: 123-456-789
                                </div>

                                <!-- OTP -->
                                <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                                    Trân trọng,<br>Prom
                                </div>

                                <!-- Link -->
                                <div style="font-size: 14px; color: #4b0082; margin-bottom: 20px;">
                                    Bạn có thể kiểm tra thông tin đơn hàng tại đây: 
                                    <a href="http://prom.com/order/${orderId}" style="color: #4b0082;">http://prom.com/order/${orderId}</a>
                                </div>

                                <!-- Button -->
                                <a href="http://prom.com" style="display: inline-block; padding: 10px 20px; background-color: #4b0082; color: #fff; text-decoration: none; border-radius: 5px; font-size: 16px;">
                                    Vào website
                                </a>

                                <!-- Footer -->
                             
                            </td>
                        </tr>
                    </table>

                    <!-- Ad Section -->
                    <table width="100%" style="padding: 20px; text-align: center; margin: 0 auto; border-radius: 10px;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td align="center">
                                <!-- Desktop Image -->
                                <div class="ad-astronaut-image">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/0532/544b/b7f130b5db2a808e46aa0198099cf28a?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=GavAo1dx14lv7t51U-sbwq9PLFKN7P0zgJ2mMmXDfiBSWWLSYwFVkfWHzyqvxoOeJbj32tDABOxDi1bWEL-oRd2Vq8MKIlvQIWcwJ89L0AfSdhlu1bR3GUnCctKNxjJUXU9H3CAGPFoaI6ewVCnuXd4WDZm2ynFXNDXn5E9ZgQ4llaixMlMso-qoXGHzkv2ra1JFJ3xmqyhsQAVgX7AO91yJ~H3VbvFYGWlMG1hKvDCt2dZI0T6zm-RaODKLOE3YAm6~NtRJjIesXNpUXp3ECVEE5MRmiulCbtnm6qF-g1gC2ES-CfHuLEd~KicapcHVCemL8qxlIcJaSpJIzhAPGw__" alt="Ad Astronaut" style="max-width: 100%; height: auto; display: block;">
                                    </a>
                                </div>
                                <!-- Mobile Image -->
                                <div class="ad-astronaut-image-mobile">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/c23a/4d18/47f9c03e8deeeedfc1e1e48e834b105f?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=Za1m95LdvRWWB69gqXgxJHi1SIfAduR-VNQ3jj022oyXgXxYB8PmEUnsuKU6i1i7AgnfbIdptsj9Vznr-vJa3sr-lct0o0cwBdkW0JuvYRkJjaq7j0085~xQOBPZJ3R1zabrU3Ny8u6FsWDu95KchTdHI9VeprI7tytGZcs6XFL~hFvagLh6EM1NwoamWDgLDWZBH3VmuXGjTmwJ2xnlcSEUpY2XOjCytpQSCFEl7-XuhIh6ykV5T1BlEOypPMVzSASJOFzHI78-Q-uGF15XH0QGPdcumjB2y4sbgAImQZmwyovG~zifl5R-iMrbKc878N7hrse1MP~txfeuJjsGTQ__" alt="Ad Astronaut" style="max-width: 100%; height: auto; display: block;">
                                    </a>
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
        subject: `Ghi nhận thông tin #${orderId}`,
        html: htmlTemplate
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to', email);
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
async function sendOtpEmail(email, otp) {
    // Template HTML với inline CSS và xử lý ảnh khác nhau giữa mobile và desktop
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mã xác thực OTP</title>
        <style type="text/css">
            /* CSS cơ bản cho các email client hỗ trợ */
            .ad-astronaut-image { display: block !important; width: 100% !important; height: auto !important; }
            .ad-astronaut-image-mobile { display: none !important; width: 0 !important; height: 0 !important; }

            /* Media query cho các client hỗ trợ (như Apple Mail) */
            @media only screen and (max-width: 600px) {
                .ad-astronaut-image { display: none !important; width: 0 !important; height: 0 !important; }
                .ad-astronaut-image-mobile { display: block !important; width: 100% !important; height: auto !important; }
            }
        </style>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f5f5ff; margin: 0; padding: 20px;">
        <table align="center" width="80%" style="width: 80%; min-height: 100vh;" cellpadding="0" cellspacing="0">
            <tr>
                <td align="center">
                    <!-- Logo -->
                    <div style="margin-bottom: 20px;">
                        <img src="https://s3-alpha-sig.figma.com/img/c9e6/61f6/a057c97fc6850110c478f8cb0d421ed8?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=jVtY6Ugqb7mB3SAXocs0WOp~CCkgkmgqHrnSZC7jx0IANiw7rHVXBCIyutOi9kmwWTrMo7-3Kr7DKTGK1W3Hxt8hqKg1AuWxwXKdfxnYvB3chzA1RkllmfnqtSF4KnpheSzBi3MxypjGwl1LRFxMGHcG1B15K5jSm5Surw22zvwFpRjvqNZhm7WaoQPFvQxwKM~VJSmKtU1k~TwqvHHP7KrVN9-9kIxQLjts0yLfGHNkEpuc5GoptCRC9AtES6g4qhIxZETpsR0xKy6FrAKgiWg0xif5NDYP7qxCzTipSRzZ3-Govy8WK9v92adDKz6-bYqrsBxTb2LjFB2DVtNdDg__" alt="Prom Logo" style="max-width: 150px; height: auto;">
                    </div>

                    <!-- Greeting -->
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">
                        Xin chào bạn, hãy nhập mã xác thực OTP bên dưới
                    </div>

                    <!-- Container -->
                    <table width="90%" style="background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin: 0 auto;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td align="center">
                                <!-- Message -->
                                <div style="font-size: 16px; color: #333; margin-bottom: 20px;">
                                    Mã xác thực của bạn là <strong style="font-size: 25px;">${otp}</strong>
                                </div>

                                <!-- OTP -->
                                <div style="font-size: 18px; font-weight: bold; color: #4b0082; margin-bottom: 20px;">
                                    Trân trọng,<br>Prom
                                </div>


                                <!-- Footer -->
                               
                            </td>
                        </tr>
                    </table>

                    <!-- Ad Section -->
                    <table width="100%" style="padding: 20px; text-align: center; margin: 0 auto; border-radius: 10px;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td align="center">
                                <!-- Desktop Image -->
                                <div class="ad-astronaut-image">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/0532/544b/b7f130b5db2a808e46aa0198099cf28a?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=GavAo1dx14lv7t51U-sbwq9PLFKN7P0zgJ2mMmXDfiBSWWLSYwFVkfWHzyqvxoOeJbj32tDABOxDi1bWEL-oRd2Vq8MKIlvQIWcwJ89L0AfSdhlu1bR3GUnCctKNxjJUXU9H3CAGPFoaI6ewVCnuXd4WDZm2ynFXNDXn5E9ZgQ4llaixMlMso-qoXGHzkv2ra1JFJ3xmqyhsQAVgX7AO91yJ~H3VbvFYGWlMG1hKvDCt2dZI0T6zm-RaODKLOE3YAm6~NtRJjIesXNpUXp3ECVEE5MRmiulCbtnm6qF-g1gC2ES-CfHuLEd~KicapcHVCemL8qxlIcJaSpJIzhAPGw__" alt="Ad Astronaut" style="max-width: 100%; height: auto; display: block;">
                                    </a>
                                </div>
                                <!-- Mobile Image -->
                                <div class="ad-astronaut-image-mobile">
                                    <a href="https://prom.vn/product">
                                        <img src="https://s3-alpha-sig.figma.com/img/c23a/4d18/47f9c03e8deeeedfc1e1e48e834b105f?Expires=1743379200&Key-Pair-Id=APKAQ4GOSFWCW27IBOMQ&Signature=Za1m95LdvRWWB69gqXgxJHi1SIfAduR-VNQ3jj022oyXgXxYB8PmEUnsuKU6i1i7AgnfbIdptsj9Vznr-vJa3sr-lct0o0cwBdkW0JuvYRkJjaq7j0085~xQOBPZJ3R1zabrU3Ny8u6FsWDu95KchTdHI9VeprI7tytGZcs6XFL~hFvagLh6EM1NwoamWDgLDWZBH3VmuXGjTmwJ2xnlcSEUpY2XOjCytpQSCFEl7-XuhIh6ykV5T1BlEOypPMVzSASJOFzHI78-Q-uGF15XH0QGPdcumjB2y4sbgAImQZmwyovG~zifl5R-iMrbKc878N7hrse1MP~txfeuJjsGTQ__" alt="Ad Astronaut" style="max-width: 100%; height: auto; display: block;">
                                    </a>
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
        subject: `Mã xác thực OTP `,
        html: htmlTemplate
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to', email);
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
module.exports = { sendOtpEmail, sendOrderEmail };