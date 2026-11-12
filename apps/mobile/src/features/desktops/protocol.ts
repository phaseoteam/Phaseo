// The polyfill must load before @phaseo/phone-protocol, so the app imports the protocol only through this file.
import "./randomValues";

export * from "@phaseo/phone-protocol";
