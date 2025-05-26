import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const Page = sequelize.define('Page', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(250),
        },
        code: {
            type: DataTypes.STRING(20),
        },
        name_short: {
            type: DataTypes.STRING(200),
        },
        name_global: {
            type: DataTypes.STRING(200),
        },
        date_start: {
            type: DataTypes.DATEONLY,
        },
        number_mem: {
            type: DataTypes.SMALLINT,
        },
        province_id: {
            type: DataTypes.INTEGER,
        },
        district_id: {
            type: DataTypes.INTEGER,
        },
        wards_id: {
            type: DataTypes.INTEGER,
        },
        nation_id: {
            type: DataTypes.INTEGER,
        },
        address: {
            type: DataTypes.STRING(250),
        },
        logo: {
            type: DataTypes.STRING(100),
        },
        logo_custom: {
            type: DataTypes.STRING(100),
        },
        taxonomy_id: {
            type: DataTypes.INTEGER,
        },
        page_name: {
            type: DataTypes.STRING(30),
        },
        page_website: {
            type: DataTypes.STRING(100),
        },
        type: {
            type: DataTypes.SMALLINT,
        },
        user_id: {
            type: DataTypes.INTEGER,
        },
        admin_id: {
            type: DataTypes.INTEGER,
        },
        package_id: {
            type: DataTypes.SMALLINT,
        },
        package_end: {
            type: DataTypes.DATE,
        },
        score: {
            type: DataTypes.INTEGER,
        },
        score_updated: {
            type: DataTypes.DATE,
        },
        package_homelogo: {
            type: DataTypes.DATE,
        },
        score_ads: {
            type: DataTypes.INTEGER,
        },
        level: {
            type: DataTypes.INTEGER,
        },
        created: {
            type: DataTypes.INTEGER,
        },
        updated: {
            type: DataTypes.INTEGER,
        },
        featured: {
            type: DataTypes.TINYINT,
        },
        status: {
            type: DataTypes.TINYINT,
        },
        phone: {
            type: DataTypes.STRING(30),
        },
        isphone: {
            type: DataTypes.TINYINT,
        },
        is_verification: {
            type: DataTypes.TINYINT,
        },
        is_oem: {
            type: DataTypes.TINYINT,
        },
        email: {
            type: DataTypes.STRING(50),
        },
        website: {
            type: DataTypes.STRING(50),
        },
        prefix_auto: {
            type: DataTypes.STRING(1000),
        },
        internal_sale: {
            type: DataTypes.TINYINT,
        },
    }, {
        tableName: 'pages',
        timestamps: false,
    });

    return Page;
}; 