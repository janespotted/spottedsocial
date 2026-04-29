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
    private var recordingTimer: Timer?
    private var recordingStartTime: Date?

    // UI Elements
    private let shutterButton = UIView()
    private let shutterInner = UIView()
    private let progressRing = CAShapeLayer()
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let flashButton = UIButton(type: .system)
    private let timerLabel = UILabel()
    private var flashMode: AVCaptureDevice.FlashMode = .off

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
        captureSession.beginConfiguration()

        // Remove current video input
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

    @objc private func handleTap() {
        // Take photo
        let settings = AVCapturePhotoSettings()
        if flashMode == .on, let device = (captureSession.inputs.first as? AVCaptureDeviceInput)?.device, device.hasFlash {
            settings.flashMode = .on
        }
        photoOutput.capturePhoto(with: settings, delegate: self)

        // Flash animation
        let flash = UIView(frame: view.bounds)
        flash.backgroundColor = .white
        flash.alpha = 0.8
        view.addSubview(flash)
        UIView.animate(withDuration: 0.15) { flash.alpha = 0 } completion: { _ in flash.removeFromSuperview() }
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

    private func startRecording() {
        guard !isRecording else { return }
        isRecording = true

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

        // Start recording to file
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("spotted_video_\(Int(Date().timeIntervalSince1970)).mp4")
        videoOutput.startRecording(to: outputURL, recordingDelegate: self)
    }

    private func stopRecording() {
        guard isRecording else { return }
        isRecording = false

        recordingTimer?.invalidate()
        recordingTimer = nil

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
        guard error == nil, let data = photo.fileDataRepresentation() else {
            print("[SpottedCamera] Photo capture error: \(error?.localizedDescription ?? "unknown")")
            return
        }

        let filename = "spotted_photo_\(Int(Date().timeIntervalSince1970)).jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        do {
            try data.write(to: url)
            dismiss(animated: true) { [weak self] in
                self?.onCapture?(.photo(url.path))
            }
        } catch {
            print("[SpottedCamera] Error saving photo: \(error)")
        }
    }
}

// MARK: - Video Recording Delegate

extension SpottedCameraViewController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            // Check if it was just max duration reached (not a real error)
            let nsError = error as NSError
            if nsError.domain == AVFoundationErrorDomain && nsError.code == -11810 {
                // Max duration reached — this is expected, not an error
            } else {
                print("[SpottedCamera] Video recording error: \(error.localizedDescription)")
                return
            }
        }

        dismiss(animated: true) { [weak self] in
            self?.onCapture?(.video(outputFileURL.path))
        }
    }
}
