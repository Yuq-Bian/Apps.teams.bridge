import {
    HttpStatusCode,
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    ApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from "@rocket.chat/apps-engine/definition/api";
import { IApiResponseJSON } from "@rocket.chat/apps-engine/definition/api/IResponse";
import { IApp } from "@rocket.chat/apps-engine/definition/IApp";
import { AppSetting } from "../config/Settings";
import { AuthenticationEndpointPath } from "../lib/Const";
import { getUserAccessTokenAsync } from "../lib/MicrosoftGraphApi";
import { persistUserAccessTokenAsync } from "../lib/PersistHelper";
import { getRocketChatAppEndpointUrl } from "../lib/UrlHelper";

export class AuthenticationEndpoint extends ApiEndpoint {
    private embeddedLoginSuccessMessage: string = 'Login to Teams succeed! You can close this window now.'
    private embeddedLoginFailureMessage: string = 'Login to Teams failed! Please check document or contact your organization admin.'

    public path = AuthenticationEndpointPath;

    constructor(app: IApp) {
        super(app);
        this.errorResponse = this.errorResponse.bind(this);
    }

    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence): Promise<IApiResponse> {
        if (request.query.error && !request.query.code) {
            return this.errorResponse();
        }

        try {
            const aadTenantId = (await read.getEnvironmentReader().getSettings().getById(AppSetting.AadTenantId)).value;
            const aadClientId = (await read.getEnvironmentReader().getSettings().getById(AppSetting.AadClientId)).value;
            const aadClientSecret = (await read.getEnvironmentReader().getSettings().getById(AppSetting.AadClientSecret)).value;
            
            const rocketChatUserId: string = request.query.state;
            const accessCode: string = request.query.code;
            const authEndpointUrl = await getRocketChatAppEndpointUrl(this.app.getAccessors(), AuthenticationEndpointPath);

            const response = await getUserAccessTokenAsync(
                http,
                accessCode,
                authEndpointUrl,
                aadTenantId,
                aadClientId,
                aadClientSecret);

            await persistUserAccessTokenAsync(
                persis,
                rocketChatUserId,
                response.accessToken,
                response.refreshToken as string,
                response.expiresIn,
                response.extExpiresIn);

            // TODO: setup token refresh mechenism in future PR
            // TODO: setup incoming message webhook in future PR
            return this.success(this.embeddedLoginSuccessMessage);
        } catch (error) {
            return this.errorResponse();
        }
    }

    private errorResponse(): IApiResponse {
        const response: IApiResponseJSON = {
            status: HttpStatusCode.BAD_REQUEST,
            content: {
                message: this.embeddedLoginFailureMessage
            },
        };

        return response;
    }
}
