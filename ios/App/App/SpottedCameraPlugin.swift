import Foundation
import Capacitor
import AVFoundation
import UIKit

@objc(SpottedCameraPlugin)
public class SpottedCameraPlugin: CAPPlugin {

    private var cameraVC: SpottedCameraViewController?
    private var savedCall: CAPPluginCall?

    @objc func openCamera(_ call: CAPPluginCall) {
        savedCall = call

        // Request camera + microphone permissions first
        AVCaptureDevice.requestAccess(for: .video) { [weak self] videoGranted in
            guard videoGranted else {
                call.reject("Camera permission denied")
                return
            }

            AVCaptureDevice.requestAccess(for: .audio) { [weak self] audioGranted in
                // Audio is optional — proceed even if denied (just no audio in video)

                DispatchQueue.main.async {
                    guard let self = self else { return }

                    let vc = SpottedCameraViewController()
                    vc.maxVideoDuration = 14.0
                    vc.hasAudioPermission = audioGranted
                    vc.modalPresentationStyle = .fullScreen
                    vc.onCapture = { [weak self] result in
                        guard let self = self, let savedCall = self.savedCall else { return }

                        switch result {
                        case .photo(let path):
                            savedCall.resolve([
                                "type": "photo",
                                "path": path
                            ])
                        case .video(let path):
                            savedCall.resolve([
                                "type": "video",
                                "path": path
                            ])
                        }

                        self.savedCall = nil
                        self.cameraVC = nil
                    }
                    vc.onCancel = { [weak self] in
                        self?.savedCall?.reject("Camera cancelled")
                        self?.savedCall = nil
                        self?.cameraVC = nil
                    }

                    self.cameraVC = vc
                    self.bridge?.viewController?.present(vc, animated: true)
                }
            }
        }
    }
}

// MARK: - Camera View Controller

enum CaptureResult {
    case photo(String)
    case video(String)
}

class SpottedCameraViewController: UIViewController {

    var maxVideoDuration: TimeInterval = 14.0
    var hasAudioPermission: Bool = true
    var onCapture: ((CaptureResult) -> Void)?
    var onCancel: (() -> Void)?

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private var photoOutput = AVCapturePhotoOutput()
    private var videoOutput = AVCaptureMovieFileOutput()
    private var currentCamera: AVCaptureDevice.Position = .back
    private var isRecording = false
    private var isSwitchingMidRecord = false
    private var recordingTimer: Timer?
    private var recordingStartTime: Date?
    private var videoSegmentPaths: [String] = []

    // UI Elements
    private let shutterButton = UIView()
    private let shutterInner = UIView()
    private let progressRing = CAShapeLayer()
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let flashButton = UIButton(type: .system)
    private let timerLabel = UILabel()
    private var flashMode: AVCaptureDevice.FlashMode = .off

    // Preview state
    private var capturedFilePath: String?
    private var capturedType: CaptureResult?
    private let previewOverlay = UIView()
    private let previewImageView = UIImageView()
    private let previewVideoPlayer = AVPlayerLayer()
    private var previewPlayer: AVPlayer?
    private let retakeButton = UIButton(type: .system)
    private let continueButton = UIButton(type: .system)

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupCamera()
        setupUI()
        setupGestures()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        captureSession.stopRunning()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        previewVideoPlayer.frame = previewOverlay.bounds
    }

    // MARK: - Camera Setup

    private func setupCamera() {
        captureSession.sessionPreset = .high

        guard let camera = getCamera(position: .back) else { return }

        do {
            let videoInput = try AVCaptureDeviceInput(device: camera)
            if captureSession.canAddInput(videoInput) { captureSession.addInput(videoInput) }

            // Add audio input only if permission granted
            if hasAudioPermission, let audioDevice = AVCaptureDevice.default(for: .audio) {
                let audioInput = try AVCaptureDeviceInput(device: audioDevice)
                if captureSession.canAddInput(audioInput) { captureSession.addInput(audioInput) }
            }
            if captureSession.canAddOutput(photoOutput) { captureSession.addOutput(photoOutput) }
            if captureSession.canAddOutput(videoOutput) { captureSession.addOutput(videoOutput) }

            // Set max duration
            videoOutput.maxRecordedDuration = CMTime(seconds: maxVideoDuration, preferredTimescale: 600)

            previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
            previewLayer.videoGravity = .resizeAspectFill
            previewLayer.frame = view.bounds
            view.layer.insertSublayer(previewLayer, at: 0)
        } catch {
            print("[SpottedCamera] Error setting up camera: \(error)")
        }
    }

    private func getCamera(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) {
            return device
        }
        return AVCaptureDevice.default(for: .video)
    }

    private func switchCamera() {
        if isRecording {
            // Mid-recording switch: stop current segment, switch, restart
            isSwitchingMidRecord = true
            videoOutput.stopRecording()
            // The delegate callback will handle the rest via isSwitchingMidRecord flag
            return
        }

        performCameraSwitch()
    }

    private func performCameraSwitch() {
        captureSession.beginConfiguration()

        for input in captureSession.inputs {
            if let deviceInput = input as? AVCaptureDeviceInput, deviceInput.device.hasMediaType(.video) {
                captureSession.removeInput(deviceInput)
            }
        }

        currentCamera = currentCamera == .back ? .front : .back

        if let camera = getCamera(position: currentCamera),
           let input = try? AVCaptureDeviceInput(device: camera),
           captureSession.canAddInput(input) {
            captureSession.addInput(input)
        }

        captureSession.commitConfiguration()
    }

    // MARK: - UI Setup

    private func setupUI() {
        // Close button (top-left)
        closeButton.setImage(UIImage(systemName: "xmark")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        closeButton.layer.cornerRadius = 22
        closeButton.clipsToBounds = true
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(handleClose), for: .touchUpInside)
        view.addSubview(closeButton)

        // Flip camera button (top-right)
        flipButton.setImage(UIImage(systemName: "camera.rotate")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
        flipButton.tintColor = .white
        flipButton.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        flipButton.layer.cornerRadius = 22
        flipButton.clipsToBounds = true
        flipButton.translatesAutoresizingMaskIntoConstraints = false
        flipButton.addTarget(self, action: #selector(handleFlip), for: .touchUpInside)
        view.addSubview(flipButton)

        // Flash button (top-right, below flip)
        flashButton.setImage(UIImage(systemName: "bolt.slash")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
        flashButton.tintColor = .white
        flashButton.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        flashButton.layer.cornerRadius = 22
        flashButton.clipsToBounds = true
        flashButton.translatesAutoresizingMaskIntoConstraints = false
        flashButton.addTarget(self, action: #selector(handleFlash), for: .touchUpInside)
        view.addSubview(flashButton)

        // Shutter button (bottom-center)
        shutterButton.backgroundColor = .clear
        shutterButton.layer.borderColor = UIColor.white.cgColor
        shutterButton.layer.borderWidth = 4
        shutterButton.layer.cornerRadius = 38
        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(shutterButton)

        shutterInner.backgroundColor = .white
        shutterInner.layer.cornerRadius = 30
        shutterInner.translatesAutoresizingMaskIntoConstraints = false
        shutterButton.addSubview(shutterInner)

        // Progress ring (around shutter for video)
        let ringPath = UIBezierPath(arcCenter: CGPoint(x: 38, y: 38), radius: 38, startAngle: -.pi / 2, endAngle: 3 * .pi / 2, clockwise: true)
        progressRing.path = ringPath.cgPath
        progressRing.strokeColor = UIColor(red: 212/255, green: 255/255, blue: 0, alpha: 1).cgColor // #d4ff00
        progressRing.fillColor = UIColor.clear.cgColor
        progressRing.lineWidth = 4
        progressRing.strokeEnd = 0
        progressRing.lineCap = .round
        shutterButton.layer.addSublayer(progressRing)

        // Timer label (above shutter)
        timerLabel.textColor = .white
        timerLabel.font = .monospacedDigitSystemFont(ofSize: 16, weight: .medium)
        timerLabel.textAlignment = .center
        timerLabel.alpha = 0
        timerLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(timerLabel)

        // Constraints
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),

            flipButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            flipButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            flipButton.widthAnchor.constraint(equalToConstant: 44),
            flipButton.heightAnchor.constraint(equalToConstant: 44),

            flashButton.topAnchor.constraint(equalTo: flipButton.bottomAnchor, constant: 16),
            flashButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            flashButton.widthAnchor.constraint(equalToConstant: 44),
            flashButton.heightAnchor.constraint(equalToConstant: 44),

            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -40),
            shutterButton.widthAnchor.constraint(equalToConstant: 76),
            shutterButton.heightAnchor.constraint(equalToConstant: 76),

            shutterInner.centerXAnchor.constraint(equalTo: shutterButton.centerXAnchor),
            shutterInner.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            shutterInner.widthAnchor.constraint(equalToConstant: 60),
            shutterInner.heightAnchor.constraint(equalToConstant: 60),

            timerLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            timerLabel.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -16),
        ])

        // Preview overlay (hidden by default)
        previewOverlay.backgroundColor = .black
        previewOverlay.isHidden = true
        previewOverlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(previewOverlay)

        previewImageView.contentMode = .scaleAspectFill
        previewImageView.clipsToBounds = true
        previewImageView.translatesAutoresizingMaskIntoConstraints = false
        previewOverlay.addSubview(previewImageView)

        previewVideoPlayer.videoGravity = .resizeAspectFill
        previewOverlay.layer.addSublayer(previewVideoPlayer)

        // Retake button (bottom-left)
        retakeButton.setImage(UIImage(systemName: "xmark")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)), for: .normal)
        retakeButton.tintColor = .white
        retakeButton.setTitle(" Retake", for: .normal)
        retakeButton.setTitleColor(.white, for: .normal)
        retakeButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        retakeButton.translatesAutoresizingMaskIntoConstraints = false
        retakeButton.addTarget(self, action: #selector(handleRetake), for: .touchUpInside)
        previewOverlay.addSubview(retakeButton)

        // Continue button (bottom-right, green arrow)
        continueButton.backgroundColor = UIColor(red: 212/255, green: 255/255, blue: 0, alpha: 1) // #d4ff00
        continueButton.layer.cornerRadius = 28
        continueButton.setImage(UIImage(systemName: "arrow.right")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold)), for: .normal)
        continueButton.tintColor = UIColor(red: 10/255, green: 1/255, blue: 24/255, alpha: 1) // #0a0118
        continueButton.translatesAutoresizingMaskIntoConstraints = false
        continueButton.addTarget(self, action: #selector(handleContinue), for: .touchUpInside)
        previewOverlay.addSubview(continueButton)

        NSLayoutConstraint.activate([
            previewOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            previewOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            previewOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            previewImageView.topAnchor.constraint(equalTo: previewOverlay.topAnchor),
            previewImageView.bottomAnchor.constraint(equalTo: previewOverlay.bottomAnchor),
            previewImageView.leadingAnchor.constraint(equalTo: previewOverlay.leadingAnchor),
            previewImageView.trailingAnchor.constraint(equalTo: previewOverlay.trailingAnchor),

            retakeButton.leadingAnchor.constraint(equalTo: previewOverlay.leadingAnchor, constant: 24),
            retakeButton.bottomAnchor.constraint(equalTo: previewOverlay.safeAreaLayoutGuide.bottomAnchor, constant: -30),

            continueButton.trailingAnchor.constraint(equalTo: previewOverlay.trailingAnchor, constant: -24),
            continueButton.bottomAnchor.constraint(equalTo: previewOverlay.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            continueButton.widthAnchor.constraint(equalToConstant: 56),
            continueButton.heightAnchor.constraint(equalToConstant: 56),
        ])
    }

    // MARK: - Gestures

    private func setupGestures() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        shutterButton.addGestureRecognizer(tap)

        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress))
        longPress.minimumPressDuration = 0.3
        shutterButton.addGestureRecognizer(longPress)

        // Double-tap anywhere on preview to flip camera (Snapchat-style)
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTapFlip))
        doubleTap.numberOfTapsRequired = 2
        view.addGestureRecognizer(doubleTap)
    }

    @objc private func handleDoubleTapFlip() {
        // Block camera flip while recording — AVCaptureMovieFileOutput can't survive session reconfiguration
        guard !isRecording else { return }

        UIView.animate(withDuration: 0.15, animations: {
            self.previewLayer.opacity = 0
        }) { _ in
            self.switchCamera()
            UIView.animate(withDuration: 0.15) {
                self.previewLayer.opacity = 1
            }
        }
    }

    private var savedBrightness: CGFloat = 0.5

    @objc private func handleTap() {
        let settings = AVCapturePhotoSettings()

        if flashMode == .on && currentCamera == .front {
            // Snapchat-style screen flash: max brightness + white overlay to illuminate face
            savedBrightness = UIScreen.main.brightness
            UIScreen.main.brightness = 1.0

            let screenFlash = UIView(frame: view.bounds)
            screenFlash.backgroundColor = .white
            screenFlash.alpha = 1.0
            screenFlash.tag = 999
            view.addSubview(screenFlash)

            // Small delay so the screen brightness illuminates the face before capture
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.photoOutput.capturePhoto(with: settings, delegate: self!)
            }
        } else {
            // Back camera: use hardware flash
            if flashMode == .on, let device = (captureSession.inputs.first as? AVCaptureDeviceInput)?.device, device.hasFlash {
                settings.flashMode = .on
            }
            photoOutput.capturePhoto(with: settings, delegate: self)

            // Capture animation
            let flash = UIView(frame: view.bounds)
            flash.backgroundColor = .white
            flash.alpha = 0.8
            view.addSubview(flash)
            UIView.animate(withDuration: 0.15) { flash.alpha = 0 } completion: { _ in flash.removeFromSuperview() }
        }
    }

    private func cleanupScreenFlash() {
        if let screenFlash = view.viewWithTag(999) {
            UIView.animate(withDuration: 0.2, animations: {
                screenFlash.alpha = 0
            }) { _ in
                screenFlash.removeFromSuperview()
            }
        }
        UIScreen.main.brightness = savedBrightness
    }

    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        switch gesture.state {
        case .began:
            startRecording()
        case .ended, .cancelled:
            stopRecording()
        default:
            break
        }
    }

    // MARK: - Recording

    private func startRecordingSegment() {
        // Start a new recording segment (used after mid-record camera switch)
        if let connection = videoOutput.connection(with: .video) {
            connection.isVideoMirrored = (currentCamera == .front)
        }
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("spotted_video_\(Int(Date().timeIntervalSince1970))_\(videoSegmentPaths.count).mp4")
        videoOutput.startRecording(to: outputURL, recordingDelegate: self)
        isRecording = true
    }

    private func startRecording() {
        guard !isRecording else { return }
        isRecording = true
        videoSegmentPaths = []

        // Enable torch/screen flash for video
        if flashMode == .on {
            if currentCamera == .back {
                // Back camera: use hardware torch
                if let device = (captureSession.inputs.compactMap { $0 as? AVCaptureDeviceInput }.first(where: { $0.device.hasMediaType(.video) }))?.device,
                   device.hasTorch {
                    try? device.lockForConfiguration()
                    device.torchMode = .on
                    device.unlockForConfiguration()
                }
            } else {
                // Front camera: screen flash (keep screen bright + white overlay while recording)
                savedBrightness = UIScreen.main.brightness
                UIScreen.main.brightness = 1.0
                let screenFlash = UIView(frame: view.bounds)
                screenFlash.backgroundColor = UIColor.white.withAlphaComponent(0.85)
                screenFlash.tag = 999
                screenFlash.isUserInteractionEnabled = false
                view.insertSubview(screenFlash, belowSubview: shutterButton)
            }
        }

        // Animate shutter to recording state
        UIView.animate(withDuration: 0.2) {
            self.shutterInner.backgroundColor = UIColor(red: 212/255, green: 255/255, blue: 0, alpha: 1)
            self.shutterInner.transform = CGAffineTransform(scaleX: 0.6, y: 0.6)
            self.shutterInner.layer.cornerRadius = 8
        }

        // Show timer
        timerLabel.alpha = 1
        timerLabel.text = "0:00"
        recordingStartTime = Date()

        // Start progress ring animation
        let animation = CABasicAnimation(keyPath: "strokeEnd")
        animation.fromValue = 0
        animation.toValue = 1
        animation.duration = maxVideoDuration
        animation.isRemovedOnCompletion = false
        animation.fillMode = .forwards
        progressRing.add(animation, forKey: "progress")

        // Timer update
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let start = self.recordingStartTime else { return }
            let elapsed = Date().timeIntervalSince(start)
            let seconds = Int(elapsed)
            let tenths = Int((elapsed - Double(seconds)) * 10)
            self.timerLabel.text = String(format: "%d:%02d", seconds, tenths)
        }

        // Mirror video for front camera so selfie videos match the preview
        if let connection = videoOutput.connection(with: .video) {
            connection.isVideoMirrored = (currentCamera == .front)
        }

        // Start recording to file
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("spotted_video_\(Int(Date().timeIntervalSince1970)).mp4")
        videoOutput.startRecording(to: outputURL, recordingDelegate: self)
    }

    private func stopRecording() {
        guard isRecording else { return }
        isRecording = false

        recordingTimer?.invalidate()
        recordingTimer = nil

        // Turn off torch/screen flash
        if flashMode == .on {
            if currentCamera == .back {
                if let device = (captureSession.inputs.compactMap { $0 as? AVCaptureDeviceInput }.first(where: { $0.device.hasMediaType(.video) }))?.device,
                   device.hasTorch {
                    try? device.lockForConfiguration()
                    device.torchMode = .off
                    device.unlockForConfiguration()
                }
            } else {
                cleanupScreenFlash()
            }
        }

        // Animate shutter back
        UIView.animate(withDuration: 0.2) {
            self.shutterInner.backgroundColor = .white
            self.shutterInner.transform = .identity
            self.shutterInner.layer.cornerRadius = 30
        }

        timerLabel.alpha = 0
        progressRing.removeAllAnimations()
        progressRing.strokeEnd = 0

        videoOutput.stopRecording()
    }

    // MARK: - Preview

    private func showPreview(result: CaptureResult) {
        capturedType = result
        captureSession.stopRunning()

        switch result {
        case .photo(let path):
            if let image = UIImage(contentsOfFile: path) {
                previewImageView.image = image
                previewImageView.isHidden = false
            }
        case .video(let path):
            let url = URL(fileURLWithPath: path)
            previewPlayer = AVPlayer(url: url)
            previewVideoPlayer.player = previewPlayer
            previewVideoPlayer.frame = view.bounds
            previewImageView.isHidden = true
            previewPlayer?.play()
            // Loop video
            NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: previewPlayer?.currentItem,
                queue: .main
            ) { [weak self] _ in
                self?.previewPlayer?.seek(to: .zero)
                self?.previewPlayer?.play()
            }
        }

        previewOverlay.isHidden = false
        previewOverlay.alpha = 0
        UIView.animate(withDuration: 0.2) {
            self.previewOverlay.alpha = 1
        }
    }

    @objc private func handleRetake() {
        // Hide preview, restart camera
        previewOverlay.isHidden = true
        previewImageView.image = nil
        previewPlayer?.pause()
        previewPlayer = nil
        previewVideoPlayer.player = nil
        capturedType = nil

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
        }
    }

    @objc private func handleContinue() {
        guard let result = capturedType else { return }
        dismiss(animated: true) { [weak self] in
            self?.onCapture?(result)
        }
    }

    // MARK: - Actions

    @objc private func handleClose() {
        dismiss(animated: true) { [weak self] in
            self?.onCancel?()
        }
    }

    @objc private func handleFlip() {
        guard !isRecording else { return }

        UIView.animate(withDuration: 0.15, animations: {
            self.previewLayer.opacity = 0
        }) { _ in
            self.switchCamera()
            UIView.animate(withDuration: 0.15) {
                self.previewLayer.opacity = 1
            }
        }
    }

    @objc private func handleFlash() {
        switch flashMode {
        case .off:
            flashMode = .on
            flashButton.setImage(UIImage(systemName: "bolt.fill")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
            flashButton.tintColor = UIColor(red: 212/255, green: 255/255, blue: 0, alpha: 1)
        default:
            flashMode = .off
            flashButton.setImage(UIImage(systemName: "bolt.slash")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
            flashButton.tintColor = .white
        }
    }

}

// MARK: - Photo Capture Delegate

extension SpottedCameraViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        // Clean up screen flash (front camera)
        cleanupScreenFlash()

        guard error == nil, let data = photo.fileDataRepresentation() else {
            print("[SpottedCamera] Photo capture error: \(error?.localizedDescription ?? "unknown")")
            return
        }

        let filename = "spotted_photo_\(Int(Date().timeIntervalSince1970)).jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        do {
            var finalData = data

            // Front camera: mirror the image so selfies match the preview
            if currentCamera == .front, let image = UIImage(data: data) {
                if let cgImage = image.cgImage {
                    let mirrored = UIImage(cgImage: cgImage, scale: image.scale, orientation: .leftMirrored)
                    if let jpegData = mirrored.jpegData(compressionQuality: 0.9) {
                        finalData = jpegData
                    }
                }
            }

            try finalData.write(to: url)
            showPreview(result: .photo(url.path))
        } catch {
            print("[SpottedCamera] Error saving photo: \(error)")
        }
    }
}

// MARK: - Video Recording Delegate

extension SpottedCameraViewController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            let nsError = error as NSError
            // Max duration or mid-switch stop — not real errors
            if nsError.domain == AVFoundationErrorDomain && nsError.code == -11810 {
                // Max duration reached
            } else if isSwitchingMidRecord {
                // Expected stop for camera switch
            } else {
                print("[SpottedCamera] Video recording error: \(error.localizedDescription)")
                return
            }
        }

        if isSwitchingMidRecord {
            // Save this segment and switch cameras
            videoSegmentPaths.append(outputFileURL.path)
            isSwitchingMidRecord = false

            // Perform the camera switch
            performCameraSwitch()

            // Brief delay to let the session stabilize, then restart recording
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.startRecordingSegment()
            }
            return
        }

        // Normal finish — check if we have multiple segments to merge
        if videoSegmentPaths.isEmpty {
            showPreview(result: .video(outputFileURL.path))
        } else {
            videoSegmentPaths.append(outputFileURL.path)
            mergeVideoSegments { [weak self] mergedPath in
                guard let mergedPath = mergedPath else {
                    // Merge failed — use last segment
                    self?.showPreview(result: .video(outputFileURL.path))
                    return
                }
                self?.showPreview(result: .video(mergedPath))
            }
        }
    }

    private func mergeVideoSegments(completion: @escaping (String?) -> Void) {
        let composition = AVMutableComposition()

        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            completion(nil)
            return
        }

        var currentTime = CMTime.zero

        for path in videoSegmentPaths {
            let asset = AVURLAsset(url: URL(fileURLWithPath: path))
            let duration = asset.duration

            if let assetVideoTrack = asset.tracks(withMediaType: .video).first {
                try? videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: assetVideoTrack, at: currentTime)
            }
            if let assetAudioTrack = asset.tracks(withMediaType: .audio).first {
                try? audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: assetAudioTrack, at: currentTime)
            }

            currentTime = CMTimeAdd(currentTime, duration)
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("spotted_merged_\(Int(Date().timeIntervalSince1970)).mp4")

        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            completion(nil)
            return
        }

        exporter.outputURL = outputURL
        exporter.outputFileType = .mp4

        exporter.exportAsynchronously {
            DispatchQueue.main.async {
                if exporter.status == .completed {
                    // Clean up segments
                    for path in self.videoSegmentPaths {
                        try? FileManager.default.removeItem(atPath: path)
                    }
                    self.videoSegmentPaths = []
                    completion(outputURL.path)
                } else {
                    print("[SpottedCamera] Merge failed: \(exporter.error?.localizedDescription ?? "unknown")")
                    completion(nil)
                }
            }
        }
    }
}
