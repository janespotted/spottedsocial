#import <Capacitor/Capacitor.h>

CAP_PLUGIN(SpottedCameraPlugin, "SpottedCamera",
    CAP_PLUGIN_METHOD(openCamera, CAPPluginReturnPromise);
)
